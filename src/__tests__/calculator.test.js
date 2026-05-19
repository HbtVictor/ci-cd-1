// src/__tests__/calculator.test.js
const { add, subtract, multiply, divide } = require('../calculator');

describe('Calculator', () => {
  test('add : 2 + 3 doit retourner 5', () => {
    expect(add(2, 3)).toBe(5);
  });

  test('subtract : 10 - 4 doit retourner 6', () => {
    expect(subtract(10, 4)).toBe(6);
  });

  test('multiply : 3 * 4 doit retourner 12', () => {
    expect(multiply(3, 4)).toBe(12);
  });

  test('divide : 10 / 2 doit retourner 5', () => {
    expect(divide(10, 2)).toBe(5);
  });

  test('divide : division par zéro lève une erreur', () => {
    expect(() => divide(10, 0)).toThrow('Division par zéro impossible');
  });

  test('add avec 0 : 0 + 5 = 5', () => {
    expect(add(0, 5)).toBe(5);
  });

  test('multiply par 0 retourne 0', () => {
    expect(multiply(5, 0)).toBe(0);
  });

  test('subtract retourne négatif si b > a', () => {
    expect(subtract(3, 10)).toBe(-7);
  });

  test('divide décimale : 1 / 3', () => {
    expect(divide(1, 3)).toBeCloseTo(0.333, 2);
  });
});
