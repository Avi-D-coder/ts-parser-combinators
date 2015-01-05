/// <reference path="../combinators.ts"/>

class Grammar {
  
  // Whitespace.
  static _ : Parser = Parser.m(x => /\s/.test(x)).zero_or_more().transformer(
    (x : Array<string>) : string => "");

  // Sequence of digits.
  static num : Parser = Parser.m(x => /\d/.test(x)).many().transformer(
    (x : Array<string>) : number => parseInt(x.join('')));

  // Sequence of non-space or paren characters.
  static symbol : Parser = Parser.m(x => /[^\s\(\)]/.test(x)).many().transformer(
    (x : Array<string>) : string => x.join(''));

  // Left paren.
  static lparen : Parser = Parser.m(x => '(' == x).transformer(x => "");

  // Right paren.
  static rparen : Parser = Parser.m(x => ')' == x).transformer(x => "");

  // Number or symbol.
  static atom : Parser = Grammar.num.or(Grammar.symbol);

  // Empty list: ().
  static empty_list : Parser = Grammar.lparen.then(Grammar._).then(Grammar.rparen).transformer(
    (x : Array<string>) : Array<string> => []);

  // Non-empty list: (s_expr s-expr*).
  static non_empty_list : Parser = Grammar.lparen.then(
    Parser.delay(x => Grammar.s_expr)).then(
      Parser.delay(x => Grammar.s_expr.zero_or_more())).then(Grammar.rparen).transformer(
        x => [x[1]].concat(x[2]));

  // s-expr: atom | empty list | non-empty list.
  static s_expr : Parser = Grammar._.then(
    Grammar.atom.or(Grammar.empty_list).or(Grammar.non_empty_list)).then(
      Grammar._).transformer(x => x[1]);

  // Parse the top level s-expression.
  static parse(input : Indexable) {
    return Grammar.s_expr.parse_input(input);
  }

}
