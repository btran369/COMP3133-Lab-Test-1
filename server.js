require("dotenv").config();
const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const { connectDB } = require("./db/conn");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");

const GroupMessage = require("./models/GroupMessage");
const PrivateMessage = require("./models/PrivateMessage");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static HTML pages from /view
// TODO: if have time, rewrite app in React for flexibility
app.use("/view", express.static(path.join(__dirname, "view")));
app.get("/", (_req, res) => res.redirect("/view/login.html"));

// API
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Rooms list (predefined)
const ROOMS = ["devops", "cloud computing", "covid19", "sports", "nodeJS", "computers", "gaming"];

function pmRoomName(userA, userB) {
    const [a, b] = [String(userA).trim(), String(userB).trim()].sort();
    return `pm:${a}__${b}`;
}


const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// username to socketId map for private msg
const userSockets = new Map();

// Simple auth: username passed in handshake query
io.use((socket, next) => {
    const username = String(socket.handshake.query.username || "").trim();
    if (!username) return next(new Error("username required"));
    socket.data.username = username;
    next();
});

io.on("connection", (socket) => {
    const username = socket.data.username;
    userSockets.set(username, socket.id);



    // Send rooms list and current online users
    socket.emit("rooms:list", ROOMS);
    io.emit("users:online", Array.from(userSockets.keys()).sort());

    socket.on("disconnect", () => {
        userSockets.delete(username);
        io.emit("users:online", Array.from(userSockets.keys()).sort());
    });

    socket.on("pm:open", async ({ with_user }) => {
        try {
            const other = String(with_user || "").trim();
            if (!other) return;

            console.log(`[pm:open] ${username} opening with ${other}`);

            if (socket.data.pmRoom) socket.leave(socket.data.pmRoom);

            const room = pmRoomName(username, other);
            socket.join(room);
            socket.data.pmRoom = room;
            socket.data.pmWith = other;

            const history = await PrivateMessage.find({
                $or: [
                    { from_user: username, to_user: other },
                    { from_user: other, to_user: username }
                ]
            })
                .sort({ date_sent: -1 })
                .limit(50)
                .lean();

            console.log(`[pm:open] history count=${history.length} room=${room}`);

            socket.emit("pm:history", history.reverse());
        } catch (err) {
            console.error("[pm:open] ERROR:", err);
            socket.emit("error:msg", "Failed to load PM history");
        }
    });





    // Join room
    socket.on("room:join", async (room) => {
        room = String(room || "").trim();
        if (!ROOMS.includes(room)) {
            socket.emit("error:msg", "Invalid room");
            return;
        }

        // Leave current room if user is in room
        if (socket.data.room) {
            socket.leave(socket.data.room);
            socket.to(socket.data.room).emit("room:system", `${username} left the room`);
        }

        socket.join(room);
        socket.data.room = room;

        socket.emit("room:joined", room);
        socket.to(room).emit("room:system", `${username} joined the room`);

        // Load last 50 group messages for room
        const history = await GroupMessage.find({ room })
            .sort({ date_sent: -1 })
            .limit(50)
            .lean();

        socket.emit(
            "room:history",
            history.reverse().map((m) => ({
                from_user: m.from_user,
                room: m.room,
                message: m.message,
                date_sent: m.date_sent
            }))
        );
    });

    // Leave room
    socket.on("room:leave", () => {
        const room = socket.data.room;
        if (!room) return;
        socket.leave(room);
        socket.to(room).emit("room:system", `${username} left the room`);
        socket.data.room = null;
        socket.emit("room:left");
    });

    // Group message (room-based)
    socket.on("room:message", async (text) => {
        const room = socket.data.room;
        if (!room) {
            socket.emit("error:msg", "Join a room first");
            return;
        }

        const message = String(text || "").trim();
        if (!message) return;

        const saved = await GroupMessage.create({
            from_user: username,
            room,
            message
        });

        io.to(room).emit("room:message", {
            from_user: saved.from_user,
            room: saved.room,
            message: saved.message,
            date_sent: saved.date_sent
        });
    });

    socket.on("pm:message", async ({ to_user, message }) => {
        try {
            const to = String(to_user || "").trim();
            const text = String(message || "").trim();
            if (!to || !text) return;

            console.log(`[pm:message] ${username} -> ${to}: ${text}`);

            const saved = await PrivateMessage.create({
                from_user: username,
                to_user: to,
                message: text
            });

            const payload = {
                from_user: saved.from_user,
                to_user: saved.to_user,
                message: saved.message,
                date_sent: saved.date_sent
            };

            const room = pmRoomName(username, to);
            io.to(room).emit("pm:message", payload);

            const toSocketId = userSockets.get(to);
            if (toSocketId) io.to(toSocketId).emit("pm:message", payload);
        } catch (err) {
            console.error("[pm:message] ERROR:", err);
            socket.emit("error:msg", "Failed to send private message");
        }
    });



    // Typing indicator for user-to-user chat
    socket.on("pm:typing", ({ to_user, isTyping }) => {
        const to = String(to_user || "").trim();
        if (!to) return;

        const room = pmRoomName(username, to);
        socket.to(room).emit("pm:typing", {
            from_user: username,
            isTyping: !!isTyping
        });
    });


    // Typing indicator for room chat
    socket.on("room:typing", (isTyping) => {
        const room = socket.data.room;
        if (!room) return;
        socket.to(room).emit("room:typing", { from_user: username, isTyping: !!isTyping });
    });
});

// Start
(async () => {
    await connectDB(process.env.MONGO_URI);

    const port = Number(process.env.PORT || 3000);
    server.listen(port, () => console.log(`Server running http://localhost:${port}`));
})();
