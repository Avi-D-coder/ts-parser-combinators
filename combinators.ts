// Generic predicate.
interface Matcher {
  (input : any) : boolean;
}

// Used for parsers that transform their input.
interface Transformation {
  (input : any) : any;
}

// We need some way to refer back to previously defined rules and the easiest way I can
// think of doing that is with closures.
interface ParserProducer {
  (input : any) : Parser;
}

// Indexable object. The parsers deal with it indirectly through IndexableContext instances.
interface Indexable {
  [index : number] : any
}

// Wraps an Indexable object
class IndexableContext {

  current_index : number;

  current_element : any;

  constructor(private input : Indexable) { 
    this.current_index = 0;
    this.current_element = input[this.current_index];
  }

  advance() : void {
    this.current_index += 1;
    this.current_element = this.input[this.current_index]
  }

  reset(index : number) : void {
    this.current_index = index;
    this.current_element = this.input[this.current_index];
  }

}

class Parser {

  parse(input : IndexableContext) : any { }

  // Convenience method for alternation.
  or(other : Parser) : Parser {
    return new AlternationParser(this, other);
  }

  // Convenience method for sequencing.
  then(other : Parser) : Parser {
    return new SequenceParser(this, other);
  }

  transformer(transformation : Transformation) : Parser {
    return new TransformParser(this, transformation);
  }

  // Repeat something at least once.
  many() : Parser {
    return new ManyParser(this);
  }

  // Succeed zero or one time.
  optional() : Parser {
    return new OptionalParser(this);
  }

  // Kleene start.
  zero_or_more() : Parser {
    return new KleeneStarParser(this);
  }

  // We only care about null/undefined values when parsing because that indicates failure.
  is_not_null(obj : any) : boolean {
    return !(null === obj || undefined === obj);
  }

  // Convenience method for wrapping indexable into a context and calling parse on it.
  parse_input(input : Indexable) : any {
    return this.parse(new IndexableContext(input));
  }

  // Convenience method so that we don't have to type "new BasicParser" over and over.
  static m(matcher : Matcher) : Parser {
    return new BasicParser(matcher);
  }

  static delay(producer : ParserProducer) : Parser {
    return new DelayedParser(producer);
  }

}

// Basic parser that just calls the matcher and advances the input or returns a failure.
class BasicParser extends Parser {

  constructor(private matcher : Matcher) { super(); }

  parse(input : IndexableContext) : any {
    var current_element : any = input.current_element;
    if (this.is_not_null(current_element) && this.matcher(current_element)) {
      input.advance();
      return current_element;
    }
    return null;
  }

}

// Corresponds to "e | f".
class AlternationParser extends Parser {

  alternatives : Array<Parser>;

  constructor(left : Parser, right : Parser) {
    super();
    this.alternatives = [left, right]
  }

  or(other : Parser) : Parser {
    this.alternatives.push(other);
    return this;
  }

  // Keep trying to parse until we run out of parsers. Make sure to reset after every failure.
  parse(input : IndexableContext) : any {
    var current_index : number = input.current_index;
    var parser_index : number = 0;
    var result : any = null;
    while (this.alternatives[parser_index] && !result) {
      input.reset(current_index);
      result = this.alternatives[parser_index].parse(input);
      parser_index += 1;
    }
    return result;
  }

}

// Corresponds to "e f".
class SequenceParser extends Parser {

  sequence : Array<Parser>;

  constructor(left : Parser, right : Parser) {
    super();
    this.sequence = [left, right];
  }

  // Overload followed_by to append to the current parser sequence.
  then(other : Parser) : Parser {
    this.sequence.push(other);
    return this;
  }

  // Keep parsing and accumulating results as long as there are parsers and return null if any fail.
  parse(input : IndexableContext) : Array<any> {
    var parser_index : number = 0;
    var result_accumulator : Array<any> = [];
    while (this.sequence[parser_index]) {
      var parse_result : any = this.sequence[parser_index].parse(input);
      if (this.is_not_null(parse_result)) {
        result_accumulator.push(parse_result);
        parser_index += 1;
      } else {
        return null;
      }
    }
    return result_accumulator;
  }

}

// Transforms the matched results.
class TransformParser extends Parser {

  constructor(public parser : Parser, public transform : Transformation) { super(); }

  parse(input : IndexableContext) : any {
    var result : any = this.parser.parse(input);
    if (this.is_not_null(result)) {
      return this.transform(result);
    }
    return null;
  }

}

// Greedly parse as many times as possible. Corresponds to "e+".
class ManyParser extends Parser {

  constructor(public parser : Parser) { super(); }

  // Logic could be cleaner here.
  parse(input : IndexableContext) : Array<any> {
    var accumulator : Array<any> = [];
    var first_result : any = this.parser.parse(input);
    if (this.is_not_null(first_result)) {
      accumulator.push(first_result);
      var current_index = input.current_index;
      var result : any = this.parser.parse(input);
      while (this.is_not_null(result)) {
        accumulator.push(result);
        current_index = input.current_index;
        result = this.parser.parse(input);
      }
      input.reset(current_index);
      return accumulator;
    }
    return null;
  }
}

// Corresponds to "e?". Always succeeds by returning either an empty array or an array with one element.
class OptionalParser extends Parser {

  constructor(public parser : Parser) { super(); }

  parse(input : IndexableContext) : Array<any> {
    var current_index : number = input.current_index;
    var result : any = this.parser.parse(input);
    if (this.is_not_null(result)) {
      return result;
    } else {
      input.reset(current_index);
    }
    return [];
  }

}

// Corresponds to "e*".
class KleeneStarParser extends Parser {

  constructor(public parser : Parser) { super(); }

  parse(input : IndexableContext) : Array<any> {
    return this.parser.many().optional().parse(input);
  }

}

// A little bit hard to explain this one but basically we have something that will generate a parser
// so we generate the parser by calling it and then use that to parse the input.
class DelayedParser extends Parser {

  constructor(public producer : ParserProducer) { super(); }

  parse(input : IndexableContext) : any {
    var parser : Parser = this.producer(input);
    return parser.parse(input);
  }

}
