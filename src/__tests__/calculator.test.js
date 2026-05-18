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
});
