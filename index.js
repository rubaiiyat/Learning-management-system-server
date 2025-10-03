const { MongoClient, ServerApiVersion, Db } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URL;

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

    // Show Users
    app.get("/users", async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.status(200).json({ result });
      } catch (error) {
        res.status(404).json({
          message: "No User Found",
        });
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
