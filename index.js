const express = require("express");
const cors = require("cors");
const app = express();
const port = 8000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const UserCollection = database.collection("user");
    const CompletedTaskCollection = database.collection("completedTasks");

    // ==========================================
    // PUBLIC ROUTES
    // ==========================================

    app.get("/api/public/tasks/open", async (req, res) => {
      try {
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

    app.get("/api/public/freelancers", async (req, res) => {
      try {
        const query = { role: "freelancer" };
        const result = await UserCollection.find(query)
          .project({ password: 0 })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching freelancers list:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.get("/api/public/freelancer/:id", async (req, res) => {
      try {
        const targetUserId = req.params.id;

        if (!ObjectId.isValid(targetUserId)) {
          return res
            .status(400)
            .send({ error: "Invalid dynamic ID tracking identifier." });
        }

        const query = { _id: new ObjectId(targetUserId) };
        const freelancerProfile = await UserCollection.findOne(query, {
          projection: { password: 0 },
        });

        if (!freelancerProfile) {
          return res
            .status(404)
            .send({ error: "No profile matching that ID located." });
        }

        res.send(freelancerProfile);
      } catch (error) {
        console.error(
          "Error inside backend route resolving freelancer profile:",
          error,
        );
        res
          .status(500)
          .send({ error: "Internal server runtime execution fault." });
      }
    });

    // ==========================================
    // CLIENT PROJECT CONTROL ENGINES
    // ==========================================

    app.post("/api/client/task-post", async (req, res) => {
      try {
        const task = req.body;
        const taskNew = {
          ...task,
          status: "open", // Fallback initialization configuration status
          createdAt: new Date(),
        };
        const result = await TaskCollection.insertOne(taskNew);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to post project task." });
      }
    });

    app.get("/api/client/tasks", async (req, res) => {
      try {
        const clientId = req.query.clientId;
        if (!clientId) {
          return res.status(400).send({ error: "Client ID is required" });
        }

        // Support matching both tracking key schemas cleanly
        const query = {
          $or: [{ client_id: clientId }, { clientId: clientId }],
        };

        const result = await TaskCollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching client tasks:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Fetch and structure proposals matching flexible query schema identifiers
    app.get("/api/client/proposals", async (req, res) => {
      try {
        const { taskId } = req.query;
        if (!taskId) {
          return res
            .status(400)
            .send({ error: "task ID parameter query string is required" });
        }

        let query = {
          $or: [{ taskId: taskId }, { task_id: taskId }],
        };

        if (ObjectId.isValid(taskId)) {
          query.$or.push({ taskId: new ObjectId(taskId) });
          query.$or.push({ task_id: new ObjectId(taskId) });
        }

        const result = await ProposalsCollection.find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result || []);
      } catch (error) {
        console.error(
          "Backend exception processing proposals acquisition fetch:",
          error,
        );
        res
          .status(500)
          .send({ error: "Internal server database configuration fault." });
      }
    });

    // Atomic transaction workflow: Accept one proposal, reject others, shift main task status
    app.post("/api/client/proposals/accept", async (req, res) => {
      try {
        const { taskId, acceptedProposalId } = req.body;

        if (!taskId || !acceptedProposalId) {
          return res.status(400).send({
            error: "Required context identification parameters are missing.",
          });
        }

        // 1. Accept targeted profile bid document matching ID
        await ProposalsCollection.updateOne(
          { _id: new ObjectId(acceptedProposalId) },
          { $set: { status: "accepted" } },
        );

        // 2. Automatically decline remaining incoming proposals tracking under the parent task
        await ProposalsCollection.updateMany(
          {
            $or: [
              { taskId: taskId },
              { taskId: new ObjectId(taskId) },
              { task_id: taskId },
              { task_id: new ObjectId(taskId) },
            ],
            _id: { $ne: new ObjectId(acceptedProposalId) },
          },
          { $set: { status: "rejected" } },
        );

        // 3. FIX: Changed 'TasksCollection' to correctly reference 'TaskCollection' variable setup
        await TaskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $set: { status: "On the progress" } },
        );

        res.status(200).send({
          success: true,
          message:
            "Workflow operations and proposal state trees updated successfully.",
        });
      } catch (error) {
        console.error(
          "Error managing proposal acceptance transaction workflow:",
          error,
        );
        res.status(500).send({
          error: "Internal server handling mutation execution exception.",
        });
      }
    });

    app.patch("/api/client/task-edit/:id", async (req, res) => {
      try {
        const taskId = req.params.id;
        const updatedData = req.body;

        const existingTask = await TaskCollection.findOne({
          _id: new ObjectId(taskId),
        });
        if (!existingTask) {
          return res.status(404).send({ error: "Task not found" });
        }

        if (existingTask.status !== "open") {
          return res.status(403).send({
            error:
              "Access Denied. You can only edit tasks when their status is 'open'.",
          });
        }

        delete updatedData._id;
        delete updatedData.client_id;
        delete updatedData.createdAt;

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

    // ==========================================
    // FREELANCER CORE PORTALS
    // ==========================================

    app.post("/api/proposals", async (req, res) => {
      try {
        const proposal = req.body;
        const proposalWithStatus = {
          ...proposal,
          status: "pending", // Ensure status initiates as pending
          submitted_at: new Date(),
        };

        const alreadyApplied = await ProposalsCollection.findOne({
          task_id: proposal.task_id,
          freelancer_email: proposal.freelancer_email,
        });

        if (alreadyApplied) {
          return res.status(400).send({
            error: "You have already submitted a proposal for this task!",
          });
        }

        const result = await ProposalsCollection.insertOne(proposalWithStatus);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to store proposal" });
      }
    });

    app.get("/api/freelancer/proposals", async (req, res) => {
      try {
        const freelancerId = req.query.freelancerId;
        if (!freelancerId) {
          return res
            .status(400)
            .send({ error: "Freelancer ID query parameter is required" });
        }

        const query = { freelancer_id: freelancerId };
        const result = await ProposalsCollection.find(query)
          .sort({ submitted_at: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching freelancer proposals:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Endpoint A: GET - Fetch active assigned tasks for a specific freelancer

    app.get("/api/freelancer/active-projects", async (req, res) => {
      try {
        const { freelancerEmail } = req.query;

        if (!freelancerEmail) {
          return res
            .status(400)
            .send({ error: "Freelancer email query is required." });
        }

        // Find all accepted proposals submitted by this freelancer
        const acceptedProposals = await ProposalsCollection.find({
          $or: [
            { freelancer_email: freelancerEmail },
            { freelancerEmail: freelancerEmail },
          ],
          status: "accepted",
        }).toArray();

        if (acceptedProposals.length === 0) {
          return res.status(200).send([]);
        }

        const taskIds = acceptedProposals.map((prop) => {
          return ObjectId.isValid(prop.task_id || prop.taskId)
            ? new ObjectId(prop.task_id || prop.taskId)
            : prop.task_id || prop.taskId;
        });

        const activeTasks = await TaskCollection.find({
          _id: { $in: taskIds },
        }).toArray();

        const combinedData = activeTasks.map((task) => {
          const match = acceptedProposals.find(
            (p) => String(p.task_id || p.taskId) === String(task._id),
          );
          return {
            ...task,
            proposalId: match?._id,
            freelancerEmail: freelancerEmail,
            // Fallback checks to find who owns the job (client_id / clientEmail)
            clientEmail:
              task.client_email || task.clientEmail || "client@giglance.com",
          };
        });

        res.status(200).send(combinedData);
      } catch (error) {
        console.error("Error fetching active freelancer projects:", error);
        res.status(500).send({ error: "Internal server handling error." });
      }
    });

    // Endpoint: POST - Process transaction and log document record to CompletedTaskCollection
    app.post("/api/freelancer/projects/submit", async (req, res) => {
      try {
        const {
          taskId,
          proposalId,
          taskTitle,
          clientEmail,
          freelancerEmail,
          submittedLink,
          message,
        } = req.body;

        if (!taskId || !proposalId || !submittedLink) {
          return res
            .status(400)
            .send({ error: "Missing mandatory data transmission parameters." });
        }

        // 1. Move parent Task collection status tracking matrix flags to 'completed'
        await TaskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $set: { status: "completed", completedAt: new Date() } },
        );

        // 2. Move Proposal document tracking matrix flags to 'completed'
        await ProposalsCollection.updateOne(
          { _id: new ObjectId(proposalId) },
          {
            $set: {
              status: "completed",
              submittedLink,
              message,
              completedAt: new Date(),
            },
          },
        );

        // 3. Document payload architecture logging target
        const completionReceipt = {
          taskId: taskId,
          proposalId: proposalId,
          taskTitle: taskTitle || "Untitled Contract Assignment",
          clientEmail: clientEmail,
          freelancerEmail: freelancerEmail,
          submittedLink: submittedLink,
          message: message || "",
          archivedAt: new Date(),
        };

        const completionLogResult =
          await CompletedTaskCollection.insertOne(completionReceipt);

        res.status(200).send({
          success: true,
          message:
            "Data logged and verified across project structures successfully!",
          receiptId: completionLogResult.insertedId,
        });
      } catch (error) {
        console.error(
          "Critical crash inside project closing runtime context:",
          error,
        );
        res
          .status(500)
          .send({ error: "Internal sequence generation logic exception." });
      }
    });

    // Endpoint: GET - Fetch completed tasks based on user role mapping
    app.get("/api/dashboard/completed-projects", async (req, res) => {
      try {
        const { email, role } = req.query;

        if (!email || !role) {
          return res
            .status(400)
            .send({
              error: "Missing identity validation parameters (email and role).",
            });
        }

        let query = {};

        // Dynamically adjust MongoDB query target filters based on dashboard view context
        if (role === "freelancer") {
          query = { freelancerEmail: email };
        } else if (role === "client") {
          query = { clientEmail: email };
        } else {
          return res
            .status(400)
            .send({ error: "Invalid account role context parameter." });
        }

        // Sort by newest completions first
        const completedList = await CompletedTaskCollection.find(query)
          .sort({ archivedAt: -1 })
          .toArray();

        res.status(200).send(completedList);
      } catch (error) {
        console.error("Error pulling archived dashboard datasets:", error);
        res
          .status(500)
          .send({ error: "Internal database query handling exception." });
      }
    });

    // Connect the client to the server
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.dir(err);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
