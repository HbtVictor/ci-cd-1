// src/calculator.js
var unused_variable = 'je ne suis jamais utilisée';
// var déclenche l'erreur no-var + no-unused-vars

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) throw new Error('Division par zéro impossible');
  return a / b;
}

module.exports = { add, subtract, multiply, divide };
