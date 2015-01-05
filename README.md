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
// etc.
```
