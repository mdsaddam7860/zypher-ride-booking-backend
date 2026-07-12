// node test-socket.js
// npm install socket.io-client --no-save   (one-time, just for this test)
const { io } = require("socket.io-client");

const DRIVER_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwYjk2YjIzMy1jM2M0LTRhMjEtODMwMC1kOWQ3MjJkZTA4OGQiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzgzODkxNzIwLCJleHAiOjE3ODQ0OTY1MjB9.YQQ5STp-dzJsI94cyvzKIgJetiryKi04KEI2gUVdjBk";

const socket = io("http://localhost:3246", { auth: { token: DRIVER_TOKEN } });

socket.on("connect", () =>
  console.log("✅ connected as driver, socket id:", socket.id)
);
socket.on("connect_error", (err) =>
  console.log("❌ connect error:", err.message)
);

socket.on("ride:offer", (payload) => {
  console.log("🔔 ride:offer received:", JSON.stringify(payload, null, 2));
});
socket.on("ride:offer:expired", (payload) => {
  console.log("⏰ ride:offer:expired:", JSON.stringify(payload, null, 2));
});
