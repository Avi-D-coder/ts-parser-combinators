/// <reference path="../combinators.ts"/>

class Brackets {

  static lbracket = Parser.m(x => '[' === x);

  static rbracket = Parser.m(x => ']' === x);

  static brackets : Parser = Brackets.lbracket.then(Parser.delay(
    _ => Brackets.brackets.zero_or_more())).then(Brackets.rbracket);

  static parse(input : string) : Array<any> {
    return Brackets.brackets.parse_input(input);
  }

}
