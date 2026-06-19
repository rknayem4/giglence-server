const express = require("express");
const cors = require("cors");
const app = express();
const port = 8000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const { ObjectId } = require("mongodb");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

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
    const database = client.db("giglance");
    const TaskCollection = database.collection("task");
    const ProposalsCollection = database.collection("proposals");

    app.get("/api/public/tasks/open", async (req, res) => {
      try {
        // Only find tasks where the status is explicitly 'open'
        const query = { status: "open" };
        const result = await TaskCollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching open tasks:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.post("/api/client/task-post", async (req, res) => {
      const task = req.body;
      const taskNew = {
        ...task,
        createdAt: new Date(),
      };
      const result = await TaskCollection.insertOne(taskNew);
      res.send(result);
    });

    app.get("/api/client/tasks", async (req, res) => {
      try {
        const clientId = req.query.clientId;

        if (!clientId) {
          return res.status(400).send({ error: "Client ID is required" });
        }

        // Filter by client_id and sort by newest tasks first
        const query = { client_id: clientId };
        const result = await TaskCollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching client tasks:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.patch("/api/client/task-edit/:id", async (req, res) => {
      try {
        const taskId = req.params.id;
        const updatedData = req.body;

        // 1. Find the target task first
        const existingTask = await TaskCollection.findOne({
          _id: new ObjectId(taskId),
        });

        if (!existingTask) {
          return res.status(404).send({ error: "Task not found" });
        }

        // 2. Strict Security Constraint: Only allow edits if status is currently "open"
        if (existingTask.status !== "open") {
          return res.status(403).send({
            error:
              "Access Denied. You can only edit tasks when their status is 'open'.",
          });
        }

        // 3. Remove fields that shouldn't change during an edit
        delete updatedData._id;
        delete updatedData.client_id;
        delete updatedData.createdAt;

        // 4. Update the task documents
        const result = await TaskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $set: { ...updatedData, updatedAt: new Date() } },
        );

        res.send(result);
      } catch (error) {
        console.error("Error editing task:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });



    // Get Single Task Detail
    app.get("/api/tasks/:id", async (req, res) => {
      try {
        const result = await TaskCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!result) return res.status(404).send({ error: "Task not found" });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Post Freelancer Proposal
    app.post("/api/proposals", async (req, res) => {
      try {
        const proposal = req.body;

        // Optional: Check if freelancer already applied
        const alreadyApplied = await ProposalsCollection.findOne({
          task_id: proposal.task_id,
          freelancer_email: proposal.freelancer_email,
        });

        if (alreadyApplied) {
          return res
            .status(400)
            .send({
              error: "You have already submitted a proposal for this task!",
            });
        }

        const result = await ProposalsCollection.insertOne(proposal);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to store proposal" });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
