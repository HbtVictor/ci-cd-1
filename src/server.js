// src/server.js
const express = require('express');
const { add, subtract, multiply, divide } = require('./calculator');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/calc/:op/:a/:b', (req, res) => {
  const { op, a, b } = req.params;
  const ops = { add, subtract, multiply, divide };
  if (!ops[op]) return res.status(400).json({ error: 'Unknown op' });
  try {
    res.json({ result: ops[op](parseFloat(a), parseFloat(b)) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
module.exports = app;
