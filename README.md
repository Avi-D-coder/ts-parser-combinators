Some basic parser combinators. Not as pretty as in a language that supports operator overloading but still pretty good. Looking at the example grammar and parsing some s-expressions with `Grammar.parse` is a pretty good way to get a handle on it. The example grammar demonstrates pretty much all the combinators and how to handle recursion with `Parser.delay`. Everything is documented below.

## Base Parser
The inductive definition of the parsers bottoms out at `Parser.m` which takes a predicate function as a parameter. A predicate function can be anything as long as it returns a boolean value. Some examples of basic parsers

```
var match_a : Parser = Parser.m(x => x === 'a');
var match_b : Parser = Parser.m(x => x === 'b');
var match_a_or_b : Parser = Parser.m(x => x.test(/[ab]/));
var whitespace : Parser = Parser.m(x => x.test(/\s/));
```

Notice in the above examples that any function that takes a single element from the input stream and then tests it for some property is a valid way to construct basic parsers. In fact the elements of the input stream do not have to be characters so the full generality comes into effect when you start parsing things like `['abc', 'def', 'hij']`. In that instance the "elements" of the input stream are not single characters but the actual strings `'abc'`, `'def'`, `'hij'` and the basic parsers that would match those elements would be

```
var match_abc : Parser = Parser.m(x => x === 'abc');
var match_def : Parser = Parser.m(x => x === 'def');
var match_hij : Parser = Parser.m(x => x === 'hij');
```

## Non-base parsers
Once you have the base parsers for the basic lexical elements it is time to combine them into compound parsers. There are two very basic constructors to master here and almost everything else is either reducible to those two or is close enough in semantics that you won't lose anything even if you pretend they are reducible.

### Alternation
Just like with regular expressions you sometimes want to express the structure of something as a set of alternatives. For example, to test the set of integers and pick out all the two digit numbers that start with '2' or '3' you could use the regular expression `/(2|3)[0-9]/`. The pipe, `|`, is known as the alternation operator/combinator and the equivalent combinator exists for parsers. TypeScript does not have operator overloading so the alternation combinator is a method instead of a symbol. To combine two parsers using alternation you use the `.or` method. The regular expression example expressed as a parser would look as follows

```
var match_2 : Parser = Parser.m(x => x === '2');
var match_2 : Parser = Parser.m(x => x === '3');
var match_digit : Parser = Parser.m(x => /[0-9]/.test(x));
var regex_parser : Parser = (match_2.or(match_3)).then(match_digit);
```

That last parser also brings us to our next combinator.

### Sequencing
Sequencing is implicit with regular expressions and between alternation and sequencing it is the more primitive operation. To match the string '23' as a regular expression you just stick that string inside a regular expression `/23/` and whatever is inside is implicitly sequenced. With parser combinators we have to be a bit more explicit and the method we use to sequence parsers is `.then`. So that example spelled out with parsers looks like

```
var match_2 : Parser = Parser.m(x => x === '2');
var match_3 : Parser = Parser.m(x => x === '3');
var match_23 : Parser = match_2.then(match_3);
```

### Delaying
This one is best demonstrated with an example because when writing recursive rules we can't immediately evaluate the parsing expression that we are recursively defining. We have to delay the evaluation of the expression by wrapping it in a function and that's where `Parser.delay` comes in. Here's an example for parsing nested brackets, e.g. `[]`, `[[]]`, `[[[]]]`, etc.

```
var lbracket : Parser = Parser.m(x => '[' === x);
var rbracket : Parser = Parser.m(x => ']' === x);
var brackets : Parser = lbracket.then(Parser.delay(
  _ => brackets.zero_or_more())).then(rbracket);
```

We need to use `Parser.delay` because `brackets` is not completely defined when we reach the point of recursively calling it. By delaying the evaluation of the middle expression in `brackets` until parse time we circumvent the problem of recursively using unfinished expressions.

### Transforming
Usually the whole point of parsing something is to create some kind of tree-like data structure so that code further down the line can work with a more explicit representation of the structure that is implicit in the textual/serialized representation. That's where `.transformer` method comes in. This one also is best demonstrated with a simple example.

```
var num_string : Parser = Parser.m(x => /\d/.test(x)).many();
var num : Parser = num_string.transformer(digits => parseInt(digits.join(''), 10));
```

The result of `num.parse_input('101')` is going to be the actual number `101`.

### Putting it all together
Putting all the previous combinators together here is the example from peg.js documentation for parsing arithmetic expressions with `+` and `*`.

```
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
```

Not as terse as the peg.js syntax but good enough. You can find the above example in `examples/arithmetic.ts`.
