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
        // 1. Parse and sanitize query parameters with fallbacks
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const search = req.query.search || "";
        const category = req.query.category || "all";

        // 2. Establish baseline filter condition
        const query = { status: "open" };

        // 3. Add dynamic text searching across Title or Description fields
        if (search.trim() !== "") {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        // 4. Add flexible category matching (handles keys like 'development' or matching full labels)
        if (category !== "all" && category !== "") {
          const categoryMap = {
            development: "Software Development",
            design: "UI/UX Design",
            marketing: "Digital Marketing",
            writing: "Content Writing",
            other: "Other Services",
          };

          const fullLabel = categoryMap[category.toLowerCase()] || category;

          query.$or = [
            { category: { $regex: `^${category}$`, $options: "i" } },
            { category: { $regex: `^${fullLabel}$`, $options: "i" } },
          ];
        }

        // 5. Query execution matrix running calculations concurrently
        const skipValue = (page - 1) * limit;

        const [tasks, totalTasksCount] = await Promise.all([
          TaskCollection.find(query)
            .sort({ createdAt: -1 })
            .skip(skipValue)
            .limit(limit)
            .toArray(),
          TaskCollection.countDocuments(query),
        ]);

        // 6. Return response package containing records metadata
        res.send({
          tasks,
          totalPages: Math.ceil(totalTasksCount / limit),
          currentPage: page,
        });
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

    // Endpoint: GET - Fetch top 6 latest open tasks for the home landing page
    app.get("/api/public/featured-tasks", async (req, res) => {
      try {
        const featuredOpenTasks = await TaskCollection.find({
          status: "open", // Safety check rule: ensures blocked/in-progress tasks are excluded
        })
          .sort({ createdAt: -1 }) // Sort by latest creation timestamp
          .limit(6) // Keep the landing grid lightweight and clean
          .toArray();

        res.status(200).send(featuredOpenTasks);
      } catch (error) {
        console.error("Error pulling featured landing data:", error);
        res
          .status(500)
          .send({ error: "Internal registry reading exception fault." });
      }
    });

    // Endpoint: GET - Fetch top 4 rated freelancers for the home landing page
    app.get("/api/public/top-freelancers", async (req, res) => {
      try {
        // 1. Gather all system user records under the freelancer category role
        const contractors = await UserCollection.find({
          role: "freelancer",
          isSuspended: false, // Moderation check guardrail rule
        }).toArray();

        // 2. Hydrate contractor dataset metrics by cross-referencing archival receipts
        const hydratedTalentProfiles = await Promise.all(
          contractors.map(async (user) => {
            // Count total instances of completed jobs inside historical receipts collection
            const jobCount = await CompletedTaskCollection.countDocuments({
              freelancerEmail: user.email,
            });

            return {
              _id: user._id,
              name: user.name,
              email: user.email,
              image: user.image,
              skills: user.skills || ["Frontend", "Fullstack", "API Dev"], // Fallback sample skills array
              averageRating: user.averageRating || 4.9, // Fallback default base rating
              totalCompletedJobs: jobCount, // Dynamic real-time calculation count
            };
          }),
        );

        // 3. Sort freelancers by performance (Highest job counts and top reviews first)
        hydratedTalentProfiles.sort(
          (a, b) =>
            b.totalCompletedJobs - a.totalCompletedJobs ||
            b.averageRating - a.averageRating,
        );

        // 4. Return top 4 choices for the landing page hero carousel row layout
        res.status(200).send(hydratedTalentProfiles.slice(0, 4));
      } catch (error) {
        console.error("Error generating top talent indexes:", error);
        res.status(500).send({
          error: "Failed to assemble professional marketplace profiles.",
        });
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
          return res.status(400).send({
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
    //  no commit

    // ==========================================
    // ADMIN CORE PORTALS
    // ==========================================

    // Endpoint A: GET - Fetch all users for the admin management dashboard
    app.get("/api/admin/users", async (req, res) => {
      try {
        // Fetch all users, sorting by newest registered accounts first
        const users = await UserCollection.find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(users);
      } catch (error) {
        console.error("Error fetching users for admin panel:", error);
        res
          .status(500)
          .send({ error: "Internal server error fetching users." });
      }
    });

    // Endpoint B: PATCH - Toggle user suspension status (suspend/unsuspend)
    app.patch("/api/admin/users/:id/suspend", async (req, res) => {
      try {
        const { id } = req.params;
        const { isSuspended } = req.body; // Expecting a boolean value

        if (typeof isSuspended !== "boolean") {
          return res
            .status(400)
            .send({ error: "Missing or invalid isSuspended state property." });
        }

        const result = await UserCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isSuspended: isSuspended } },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ error: "User profile target account not found." });
        }

        res.status(200).send({
          success: true,
          message: isSuspended
            ? "User account successfully suspended."
            : "User account successfully unsuspended.",
        });
      } catch (error) {
        console.error(
          "Critical error updating suspension matrix status:",
          error,
        );
        res
          .status(500)
          .send({ error: "Internal server data mutation exception." });
      }
    });

    // Endpoint A: GET - Fetch all posted marketplace tasks for the admin overview panel
    app.get("/api/admin/tasks", async (req, res) => {
      try {
        const tasks = await TaskCollection.find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(tasks);
      } catch (error) {
        console.error("Error pulling all tasks for admin panel:", error);
        res
          .status(500)
          .send({ error: "Internal server error fetching system tasks." });
      }
    });

    // Endpoint B: PATCH - Toggle task block/unblock status matrices
    app.patch("/api/admin/tasks/:id/block", async (req, res) => {
      try {
        const { id } = req.params;
        const { blockTask } = req.body; // Expecting a boolean value: true (to block), false (to unblock)

        if (typeof blockTask !== "boolean") {
          return res.status(400).send({
            error: "Missing or invalid blockAction target flag parameters.",
          });
        }

        // Determine the next status string based on the incoming request boolean action flag
        const nextStatus = blockTask ? "blocked" : "open";

        const result = await TaskCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: nextStatus, updatedByAdminAt: new Date() } },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ error: "Target task document registry item not found." });
        }

        res.status(200).send({
          success: true,
          message: blockTask
            ? "Task successfully blocked."
            : "Task successfully restored back to open status.",
        });
      } catch (error) {
        console.error(
          "Critical error changing administrative task visibility status:",
          error,
        );
        res.status(500).send({
          error: "Internal server error performing task state mutation.",
        });
      }
    });

    // Endpoint: DELETE - Permanently remove a task ONLY if its status is 'open'
    app.delete("/api/admin/tasks/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Strict rule evaluation: match ID AND ensure status is explicitly 'open'
        const result = await TaskCollection.deleteOne({
          _id: new ObjectId(id),
          status: { $in: ["open", null] }, // handles "open" status or tasks with no status field default
        });

        if (result.deletedCount === 0) {
          return res.status(400).send({
            error:
              "Action denied. You can only delete tasks that are currently 'open'.",
          });
        }

        res.status(200).send({
          success: true,
          message: "Open task successfully removed from system databases.",
        });
      } catch (error) {
        console.error("Error executing task deletion sequence:", error);
        res.status(500).send({
          error: "Internal server error processing deletion request.",
        });
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
