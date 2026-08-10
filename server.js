const express = require('express');
const path = require('path');

const app = express();

// Serve static files from project root
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA-style navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
