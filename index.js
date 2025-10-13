const { MongoClient, ServerApiVersion, Db, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

const uri = process.env.MONGODB_URL;
const secret = process.env.JWT_SECRET;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("lms-server");
    const userCollection = database.collection("users");
    const adminCollection = database.collection("admin");
    const courseCollection = database.collection("course");
    const assignmentCollection = database.collection("assignment");

    // create users api
    app.post("/users", async (req, res) => {
      const user = req.body;
      try {
        const result = await userCollection.insertOne(user);
        res.status(200).json({
          message: "Inserted Successfull",
          title: user.name,
        });
      } catch (error) {
        res.status(404).json({
          message: "Not Inserted",
        });
      }
    });

    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(404).json({ message: "Email required" });
      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        const role = user.role || "Student";
        const token = jwt.sign({ email: user.email, role: role }, secret, {
          expiresIn: "1d",
        });

        res.cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000,
        });

        res.status(200).json({ token, role: user.role });
      } catch (error) {
        res.status(500).json({ message: "jwt generate failed", error });
      }
    });

    const verifyJWT = (req, res, next) => {
      const token = req.cookies.token;

      if (!token) return res.status(401).json({ message: "Unauthorized" });

      jwt.verify(token, secret, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Forbidden" });
        req.user = decoded;
        next();
      });
    };

    app.get("/verify-token", (req, res) => {
      const token = req.cookies.token;

      if (!token) return res.status(401).json({ message: "Unauthorized" });

      jwt.verify(token, secret, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Forbidden" });

        res.status(200).json({ email: decoded.email, role: decoded.role });
      });
    });

    app.get("/admin-data", verifyJWT, async (req, res) => {
      if (req.user.role !== "Admin")
        return res.status(404).json({ message: "Not Admin" });

      const admins = await userCollection.find().toArray();
      res.status(200).json({ admins });
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
      });
      res.status(200).json({ message: "Logout successful" });
    });

    // Show Users
    app.get("/users", async (req, res) => {
      try {
        const email = req.query.email;
        let query = {};
        if (email) {
          query = { email };
        }
        const result = await userCollection.find(query).toArray();
        if (result.length === 0) {
          return res.status(404).json({ message: "No User Found" });
        }
        res.status(200).json({ result });
      } catch (error) {
        res.status(404).json({
          message: "No User Found",
        });
      }
    });

    // Update User
    app.put("/user/update/:email", async (req, res) => {
      const email = req.params.email;
      const updateData = req.body;

      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: updateData }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found" });
        }
        res.status(200).json({
          message: "User Updated",
          result,
        });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error updating user", error: error.message });
      }
    });

    // Create Course Api
    app.post("/courses", async (req, res) => {
      const course = req.body;
      try {
        const addCourse = await courseCollection.insertOne(course);
        res
          .status(200)
          .json({ message: "Add Successful", title: course.title });
      } catch (error) {
        res.status(404).json({ message: "Not created" });
      }
    });

    // ShowCourse Api
    app.get("/courses", async (req, res) => {
      try {
        const course = await courseCollection.find().toArray();
        res.status(200).json({ course });
      } catch (error) {
        res.status(404).json({ message: "No course availabe" });
      }
    });

    app.get("/course/:id", async (req, res) => {
      const courseId = req.params.id;
      try {
        const result = await courseCollection.findOne({
          _id: new ObjectId(courseId),
        });
        if (!result)
          return res.status(404).json({ message: "Course not found" });
        res.status(200).json({ result });
      } catch (error) {
        res.status(404).json({ message: error.message });
      }
    });

    // Post/ Enrolled Course
    app.post("/enroll", async (req, res) => {
      const { email, courseId } = req.body;

      if (!email || !courseId) {
        return res
          .status(404)
          .json({ message: "Email and courseId is required" });
      }

      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.enrolledCourse?.includes(courseId)) {
          return res.status(400).json({ message: "Already Enrolled" });
        }
        await userCollection.updateOne(
          { email },
          { $addToSet: { enrolledCourse: courseId } }
        );

        res.status(200).json({ message: "Enroll successful!" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Enrolled failed", error: error.message });
      }
    });

    // Check User Enrollment
    app.get("/check-enrollment", async (req, res) => {
      const { email, courseId } = req.query;
      if (!email || !courseId) {
        return res.status(404).json({ message: "Email and courseId required" });
      }

      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const enrolled = user.enrolledCourse?.includes(courseId);
        res.status(200).json({ enrolled });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error checking enrollment", error: error.message });
      }
    });

    // Get/ Show my class
    app.get("/myclasses", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(404).json({ message: "Email required" });

      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const enrolledIds = user.enrolledCourse || [];

        const courses = await courseCollection
          .find({ _id: { $in: enrolledIds.map((id) => new ObjectId(id)) } })
          .toArray();

        res.status(200).json({ courses });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to fetch classes", error: error.message });
      }
    });

    // Submit assignment
    app.post("/submit-assignment", async (req, res) => {
      const { courseId, assignmentName, userEmail, assignmentLink } = req.body;

      if (!courseId || !userEmail) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      try {
        const existing = await assignmentCollection.findOne({
          courseId,
          userEmail,
        });

        if (existing) {
          return res
            .status(400)
            .json({ message: "You have already submitted this assignment" });
        }

        const result = await assignmentCollection.insertOne({
          courseId,
          assignmentName,
          userEmail,
          assignmentLink,
          mark: 0,
          status: "Pending",
        });

        res.status(200).json({ message: "Assignment submitted successfully!" });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Not submitted", error: error.message });
      }
    });

    app.get("/submit-assignment", async (req, res) => {
      try {
        const result = await assignmentCollection.find().toArray();
        res.status(200).json({ result });
      } catch (error) {
        res.status(404).json({ message: "Not Found" });
      }
    });

    app.put("/set-mark/assignment/:id", async (req, res) => {
      const id = req.params.id;
      const { mark, status } = req.body;

      try {
        const result = await assignmentCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          { $set: { mark: mark, status: status } }
        );

        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "Updated successfully" });
        } else {
          res.status(404).json({ message: "Assignment not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Server not found" });
      }
    });

    // Admin info and create admin collection
    app.post("/admin", async (req, res) => {
      const adminUser = req.body;
      try {
        const result = await adminCollection.insertOne(adminUser);
        res.status(200).json({
          message: "Inserted",
          title: adminUser.name,
        });
      } catch (error) {
        res.status(404).json({ message: "Not Inserted" });
      }
    });

    // Show admin users
    app.get("/admin", async (req, res) => {
      try {
        const result = await adminCollection.find().toArray();
        res.status(200).json({ result });
      } catch (error) {
        res.status(404).json({
          message: "No Admin found",
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
