// In your handleSubmit function:
const response = await fetch("http://localhost:3000/api/health", {
  method: "GET",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(eventData),
});
