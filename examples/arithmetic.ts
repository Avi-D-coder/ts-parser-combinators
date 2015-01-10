/// <reference path="../combinators.ts"/>

class Arithmetic {

  // whitespace
  static _ = Parser.m(x => /\s/.test(x)).zero_or_more();

  // (
  static lparen = Parser.m(x => '(' === x);

  // )
  static rparen = Parser.m(x => ')' === x);

  // +
  static plus = Parser.m(x => '+' === x);

  // *
  static times = Parser.m(x => '*' === x);

  // sequence of digits converted to an actual number
  static num = Parser.m(x => /\d/.test(x)).many().transformer(
    digits => parseInt(digits.join(''), 10));

  // multiplicative + additive / multiplicative
  static additive : Parser = ((Parser.delay(_ => Arithmetic.multiplicative).then(Arithmetic._).then(
    Arithmetic.plus).then(Arithmetic._).then(
      Parser.delay(_ => Arithmetic.additive))).transformer(
        (x : Array<any>) => x[0] + x[4])).or(Parser.delay(_ => Arithmetic.multiplicative));

  // primary * multiplicative / primary
  static multiplicative : Parser = (Parser.delay(_ => Arithmetic.primary).then(Arithmetic._).then(
    Arithmetic.times).then(Arithmetic._).then(
      Parser.delay(_ => Arithmetic.multiplicative))).transformer(
        x => x[0] * x[4]).or(Parser.delay(_ => Arithmetic.primary));

  // num / (additive)
  static primary = Arithmetic.num.or((Arithmetic.lparen.then(Arithmetic._).then(
    Arithmetic.additive).then(Arithmetic._).then(Arithmetic.rparen)).transformer(
      x => x[2]));

  static parse(input : string) : number {
    return Arithmetic.additive.parse_input(input);
  }

}
