const express = require("express");
const cors = require("cors");
const app = express();
const port = 8000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`),
);

const verifyTokenAdmin = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(404).json({ message: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(404).json({ message: "unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (payload.role == "admin") {
      // console.log(payload.role);
      next();
    }
  } catch (error) {
    console.log(error)
    return res.status(403).json({ message: "forbidden" });
  }
};

const verifyTokenFreelancer = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(404).json({ message: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(404).json({ message: "unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (payload.role == "freelancer") {
      // console.log(payload.role);
      next();
    }
  } catch (error) {
    return res.status(403).json({ message: "forbidden" });
  }
};

const verifyTokenClient = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(404).json({ message: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(404).json({ message: "unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (payload.role == "client") {
      // console.log(payload.role);
      next();
    }
  } catch (error) {
    return res.status(403).json({ message: "forbidden" });
  }
};

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// async function run() {
//   try {---

client
  .connect(() => {
    console.log("connecting to mongodb");
  })
  .catch(console.dir);

const database = client.db("giglance");
const TaskCollection = database.collection("task");
const ProposalsCollection = database.collection("proposals");
const UserCollection = database.collection("user");
const CompletedTaskCollection = database.collection("completedTasks");
const PaymentCollection = database.collection("payment");

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

app.get("/api/public/tasks/:id", async (req, res) => {
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
    res.status(500).send({ error: "Internal server runtime execution fault." });
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
app.get(
  "/api/client/dashboard-summary",
  verifyTokenClient,
  async (req, res) => {
    try {
      const { email } = req.query; // Identify the logged-in client (e.g., c@gmail.com)

      if (!email) {
        return res
          .status(400)
          .send({ error: "Client email parameter is required." });
      }

      // Query your collections using the EXACT keys from your documents
      const [totalTasks, openTasks, inProgressTasks, rawPayments] =
        await Promise.all([
          // 1. Total tasks posted by this client
          TaskCollection.countDocuments({ client_email: email }),

          // 2. Open tasks waiting for bids
          TaskCollection.countDocuments({
            client_email: email,
            status: "open",
          }),

          // 3. Tasks currently active/in-progress
          TaskCollection.countDocuments({
            client_email: email,
            status: { $in: ["in_progress", "On the progress"] },
          }),

          // 4. Payments from your paymentCollection matching this client
          PaymentCollection.find({ client_email: email }).toArray(),
        ]);

      // Aggregate total funds spent safely
      const totalSpent = rawPayments.reduce(
        (acc, current) => acc + (Number(current.amount) || 0),
        0,
      );

      // Send back parameters matching your state configuration keys
      res.status(200).send({
        totalTasks,
        openTasks,
        inProgressTasks, // This will map cleanly onto your UI cards!
        totalSpent,
      });
    } catch (error) {
      console.error("Client dashboard loading fault:", error.message);
      res.status(500).send({
        error: "Failed to collect client summary metrics records.",
      });
    }
  },
);

app.post("/api/client/task-post", verifyTokenClient, async (req, res) => {
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

app.get(
  "/api/client/completed-projects",
  verifyTokenClient,
  async (req, res) => {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({
          error: "Missing identity validation parameters (email).",
        });
      }

      let query = { clientEmail: email };

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
  },
);

// Fetch and structure proposals matching flexible query schema identifiers
app.get("/api/client/proposals", verifyTokenClient, async (req, res) => {
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

    // 1. Selected proposal accept
    await ProposalsCollection.updateOne(
      {
        _id: new ObjectId(acceptedProposalId),
      },
      {
        $set: {
          status: "accepted",
        },
      },
    );

    // 2. Other proposals reject
    await ProposalsCollection.updateMany(
      {
        task_id: taskId, // string হিসেবেই থাকবে
        _id: {
          $ne: new ObjectId(acceptedProposalId),
        },
      },
      {
        $set: {
          status: "rejected",
        },
      },
    );

    // 3. Update task status
    await TaskCollection.updateOne(
      {
        _id: new ObjectId(taskId),
      },
      {
        $set: {
          status: "in_progress",
        },
      },
    );

    res.send({
      success: true,
      message: "Proposal accepted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).send({
      success: false,
      error: error.message,
    });
  }
});

app.patch("/api/client/task-edit/:id", verifyTokenClient, async (req, res) => {
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

app.get("/api/client/payments", verifyTokenClient, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res
        .status(400)
        .send({ error: "Client email parameter is required." });
    }

    const clientPayments = await PaymentCollection.aggregate([
      {
        // 🔒 SECURITY FILTER: Only fetch records belonging to this logged-in client
        $match: { client_email: email },
      },
      {
        $addFields: {
          cleanedTaskIdStr: { $trim: { input: "$task_id" } },
        },
      },
      {
        $addFields: {
          convertedTaskId: {
            $convert: {
              input: "$cleanedTaskIdStr",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "task",
          localField: "convertedTaskId",
          foreignField: "_id",
          as: "taskDetails",
        },
      },
      {
        $unwind: {
          path: "$taskDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          stripe_session_id: 1,
          freelancer_email: 1,
          amount: 1,
          status: 1,
          task_title: {
            $ifNull: ["$taskDetails.title", "Archived Project Reference"],
          },
          category: { $ifNull: ["$taskDetails.category", "general"] },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]).toArray();

    res.status(200).send(clientPayments);
  } catch (error) {
    console.error("Error loading client payment ledger:", error);
    res.status(500).send({
      error: "Internal server error fetching client billing data.",
    });
  }
});

// ==========================================
// FREELANCER CORE PORTALS
// ==========================================

app.get(
  "/api/freelancer/dashboard-summary",
  verifyTokenFreelancer,
  async (req, res) => {
    try {
      const { email } = req.query; // Identify logged-in freelancer (e.g., f1@gmail.com)

      if (!email) {
        return res
          .status(400)
          .send({ error: "Freelancer email parameter is required." });
      }

      // Query collections filtered specifically by the freelancer's email field identifiers
      const [totalProposals, pendingProposals, activeProposals, rawPayments] =
        await Promise.all([
          ProposalsCollection.countDocuments({ freelancer_email: email }),
          ProposalsCollection.countDocuments({
            freelancer_email: email,
            status: "pending",
          }),
          ProposalsCollection.countDocuments({
            freelancer_email: email,
            status: "in_progress",
          }),
          PaymentCollection.find({ freelancer_email: email }).toArray(),
        ]);

      // Aggregate total funds earned/received by this freelancer safely
      const totalEarnings = rawPayments.reduce(
        (acc, current) => acc + (Number(current.amount) || 0),
        0,
      );

      res.status(200).send({
        totalProposals,
        pendingProposals,
        activeProposals,
        totalEarnings,
      });
    } catch (error) {
      console.error("Freelancer dashboard logic fault:", error.message);
      res.status(500).send({
        error: "Failed to collect freelancer summary metrics records.",
      });
    }
  },
);

app.post("/api/proposals", verifyTokenFreelancer, async (req, res) => {
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

app.get(
  "/api/freelancer/proposals",
  verifyTokenFreelancer,
  async (req, res) => {
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
  },
);

// Endpoint A: GET - Fetch active assigned tasks for a specific freelancer

app.get(
  "/api/freelancer/active-projects",
  verifyTokenFreelancer,
  async (req, res) => {
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
  },
);

// Endpoint: POST - Process transaction and log document record to CompletedTaskCollection
app.post(
  "/api/freelancer/projects/submit",
  verifyTokenFreelancer,
  async (req, res) => {
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
        return res.status(400).send({
          error: "Missing mandatory data transmission parameters.",
        });
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
  },
);

// Endpoint: GET - Fetch completed tasks based on user role mapping
app.get(
  "/api/dashboard/completed-projects",
  verifyTokenFreelancer,
  async (req, res) => {
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
  },
);

app.get("/api/freelancer/payments", verifyTokenFreelancer, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res
        .status(400)
        .send({ error: "Freelancer email parameter is required." });
    }

    const freelancerPayments = await PaymentCollection.aggregate([
      {
        // 🔒 SECURITY FILTER: Only fetch payouts belonging to this freelancer
        $match: { freelancer_email: email },
      },
      {
        $addFields: {
          cleanedTaskIdStr: { $trim: { input: "$task_id" } },
        },
      },
      {
        $addFields: {
          convertedTaskId: {
            $convert: {
              input: "$cleanedTaskIdStr",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "task",
          localField: "convertedTaskId",
          foreignField: "_id",
          as: "taskDetails",
        },
      },
      {
        $unwind: {
          path: "$taskDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          stripe_session_id: 1,
          client_email: 1,
          amount: 1,
          status: 1,
          task_title: {
            $ifNull: ["$taskDetails.title", "Archived Project Reference"],
          },
          category: { $ifNull: ["$taskDetails.category", "general"] },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]).toArray();

    res.status(200).send(freelancerPayments);
  } catch (error) {
    console.error("Error loading freelancer payout ledger:", error);
    res.status(500).send({
      error: "Internal server error fetching freelancer earnings data.",
    });
  }
});

// ==========================================
// ADMIN CORE PORTALS
// ==========================================
app.get("/api/admin/dashboard-summary", verifyTokenAdmin, async (req, res) => {
  try {
    const [totalUsers, totalTasks, activeTasks, rawPayments] =
      await Promise.all([
        UserCollection.countDocuments({}),
        TaskCollection.countDocuments({}),
        TaskCollection.countDocuments({ status: "open" }),
        PaymentCollection.find({}).toArray(),
      ]);

    // Aggregate payment amount variables cleanly on your runtime matrix
    const totalRevenue = rawPayments.reduce(
      (acc, current) => acc + (Number(current.amount) || 0),
      0,
    );

    res.status(200).send({
      totalUsers,
      totalTasks,
      activeTasks,
      totalRevenue,
    });
  } catch (error) {
    res.status(500).send({
      error: "Failed to collect admin summary metrics matrix records.",
    });
  }
});

// Endpoint A: GET - Fetch all users for the admin management dashboard
app.get("/api/admin/users", verifyTokenAdmin, async (req, res) => {
  try {
    // Fetch all users, sorting by newest registered accounts first
    const users = await UserCollection.find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(users);
  } catch (error) {
    console.error("Error fetching users for admin panel:", error);
    res.status(500).send({ error: "Internal server error fetching users." });
  }
});

// Endpoint B: PATCH - Toggle user suspension status (suspend/unsuspend)
app.patch(
  "/api/admin/users/:id/suspend",
  verifyTokenAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isSuspended } = req.body; // Expecting a boolean value

      if (typeof isSuspended !== "boolean") {
        return res.status(400).send({
          error: "Missing or invalid isSuspended state property.",
        });
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
      console.error("Critical error updating suspension matrix status:", error);
      res
        .status(500)
        .send({ error: "Internal server data mutation exception." });
    }
  },
);

// Endpoint A: GET - Fetch all posted marketplace tasks for the admin overview panel
app.get("/api/admin/tasks",  async (req, res) => {
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

// Endpoint A: GET - Fetch all transaction for the admin transaction section
// const { ObjectId } = require("mongodb");

app.get("/api/admin/payments", verifyTokenAdmin, async (req, res) => {
  try {
    const paymentsWithTaskDetails = await PaymentCollection.aggregate([
      {
        // Step 1: Trim spaces and safely convert string task_id into an ObjectId
        $addFields: {
          cleanedTaskIdStr: { $trim: { input: "$task_id" } },
        },
      },
      {
        $addFields: {
          convertedTaskId: {
            $convert: {
              input: "$cleanedTaskIdStr",
              to: "objectId",
              onError: null, // Prevents crashing if a string is corrupt
              onNull: null,
            },
          },
        },
      },
      {
        // Step 2: Join with the task collection using the safely parsed ObjectId
        $lookup: {
          from: "task",
          localField: "convertedTaskId",
          foreignField: "_id",
          as: "taskDetails",
        },
      },
      {
        // Step 3: Flatten the array
        $unwind: {
          path: "$taskDetails",
          preserveNullAndEmptyArrays: true, // VERY IMPORTANT: Prevents dropping the payment line if no task matches!
        },
      },
      {
        // Step 4: Map properties cleanly for your frontend
        $project: {
          _id: 1,
          stripe_session_id: 1,
          client_email: 1,
          freelancer_email: 1,
          amount: 1,
          status: 1,
          // If the task lookup failed, fall back gracefully instead of hiding the row
          task_title: {
            $ifNull: ["$taskDetails.title", "Archived Project Reference"],
          },
          category: { $ifNull: ["$taskDetails.category", "general"] },
        },
      },
      {
        // Step 5: Sort so newest transactions appear at the top
        $sort: { _id: -1 },
      },
    ]).toArray();

    res.status(200).send(paymentsWithTaskDetails);
  } catch (error) {
    console.error("Aggregation Fault loading transaction matrices:", error);
    res.status(500).send({
      error: "Internal server error fetching linked system metrics rows.",
    });
  }
});

// Endpoint B: PATCH - Toggle task block/unblock status matrices
app.patch("/api/admin/tasks/:id/block", verifyTokenAdmin, async (req, res) => {
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
app.delete("/api/admin/tasks/:id", verifyTokenAdmin, async (req, res) => {
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

app.post("/create-checkout-session", async (req, res) => {
  const { name, amount } = req.body;

  const session = await stripe.checkout.sessions.create({
    ui_mode: "custom",
    mode: "payment",

    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name,
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      },
    ],

    return_url: `${FRONTEND_URL}/dashboard/client/task-proposals/success?session_id={CHECKOUT_SESSION_ID}`,
  });

  res.json({
    clientSecret: session.client_secret,
  });
});

app.post("/payments/save", async (req, res) => {
  const payment = req.body;

  const result = await PaymentCollection.insertOne(payment);

  res.send(result);
});

// Connect the client to the server
// await client.connect();
// await client.db("admin").command({ ping: 1 });
// console.log(
//   "Pinged your deployment. You successfully connected to MongoDB!",
// );
//   } catch (err) {
//     console.dir(err);
//   }
// }
// run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;
