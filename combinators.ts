// Generic predicate. The fundamental parsers delegate to matchers when deciding whether to
// accept or reject something in the input stream.
interface Matcher {
  (input : any) : boolean;
}
// If we only parsed the input and did nothing with it then we would just have recognizers.
// This is just a generic function interface for transforming parsed input.
interface Transformation {
  (input : any) : any;
}
// Wrapping generation of a parser in a function is the easiest way to make it recursive and also
// allow it to refer to rules that have not yet been created.
interface ParserProducer {
  (input : IndexableContext) : Parser;
}
// Indexable object. The parsers deal with it indirectly through IndexableContext instances.
interface Indexable {
  [index : number] : any
}
// Wraps an Indexable object and keeps a pointer into the underlying stream for rewinding when
// there are failures during the parsing process.
class IndexableContext {
  // Where we are in the input stream.
  current_index : number;
  // The actual element the index is pointing to.
  current_element : any;
  // Wraps an array-like object that supports integer indexing.
  constructor(private input : Indexable) { 
    this.current_index = 0;
    this.current_element = input[this.current_index];
  }
  // Go forward 1 in the input stream.
  advance() : void {
    this.current_index += 1;
    this.current_element = this.input[this.current_index]
  }
  // Reset the index to the given number. Used when parsers need to rewind.
  reset(index : number) : void {
    this.current_index = index;
    this.current_element = this.input[this.current_index];
  }
}
// The base class for all the parsers.
class Parser {
  // Must be implemented in the subclasses.
  parse(input : IndexableContext) : any { throw new Error('Must implement in subclass.'); }
  // Convenience method for alternation.
  or(other : Parser) : Parser {
    return new AlternationParser(this, other);
  }
  // Convenience method for sequencing.
  then(other : Parser) : Parser {
    return new SequenceParser(this, other);
  }
  // Convenience method for generating a transforming parser.
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
  is_null(obj : any) : boolean {
    return null === obj || undefined === obj;
  }
  // Convenience method for wrapping indexable into a context and calling parse on it.
  parse_input(input : Indexable) : any {
    return this.parse(new IndexableContext(input));
  }
  // Convenience method so that we don't have to type "new BasicParser" over and over.
  static m(matcher : Matcher) : Parser {
    return new BasicParser(matcher);
  }
  // Delayed parser generator. Currently the only way to achieve recursion.
  static delay(producer : ParserProducer) : Parser {
    return new DelayedParser(producer);
  }
}
// Basic parser that just calls the matcher and advances the input or returns a failure.
class BasicParser extends Parser {
  // The basic parser is a wrapper around a matcher that drives the context based on the result
  // of the matcher.
  constructor(private matcher : Matcher) {
    super();
    if (!this.is_not_null(matcher)) { throw new Error(); }
  }
  // Advance and return the element if matcher succeeds and return null otherwise.
  parse(input : IndexableContext) : any {
    var current_element : any = input.current_element;
    if (this.is_not_null(current_element) && this.matcher(current_element)) {
      input.advance(); return current_element;
    }
    return null;
  }
}
// Corresponds to "e | f".
class AlternationParser extends Parser {
  // Keep the altenratives in an array.
  private alternatives : Array<Parser>;
  // We always start with at least two parsers.
  constructor(private left : Parser, private right : Parser) {
    super();
    if (!this.is_not_null(left)) { throw new Error(); }
    if (!this.is_not_null(right)) { throw new Error(); }
    this.alternatives = [left, right]
  }
  // Override or to append to the current list of parsers and return self for easy chaining.
  or(other : Parser) : Parser {
    this.alternatives.push(other);
    return this;
  }
  // Keep trying to parse until we run out of parsers. Make sure to reset after every failure.
  parse(input : IndexableContext) : any {
    var current_index : number = input.current_index;
    var parser_index : number = 0;
    var result : any = null;
    while (this.alternatives[parser_index] && this.is_null(result)) {
      input.reset(current_index);
      result = this.alternatives[parser_index].parse(input);
      parser_index += 1;
    }
    return result;
  }
}
// Corresponds to "e f".
class SequenceParser extends Parser {
  // Same as for parsing alternatives we keep the sequence of parsers in an array.
  private sequence : Array<Parser>;
  // We always start with a sequence of at least two parsers.
  constructor(private left : Parser, private right : Parser) {
    super();
    if (!this.is_not_null(left)) { throw new Error(); }
    if (!this.is_not_null(right)) { throw new Error(); }
    this.sequence = [left, right];
  }
  // Override then to append to the current parser sequence and return self for easy chaining.
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
  // Wraps the parser and the corresponding transformation.
  constructor(private parser : Parser, private transform : Transformation) { 
    super(); 
    if (!this.is_not_null(parser)) { throw new Error(); }
    if (!this.is_not_null(transform)) { throw new Error(); }
  }
  // Parse and pass the non-null results to the transformer and return that as the result.
  // Note: returning null from the transformer indicates failure and is probably not desired.
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
  // Wraps the underlying parser so that it can be used as many times as possible.
  constructor(private parser : Parser) { 
    super(); 
    if (!this.is_not_null(parser)) { throw new Error(); }
  }
  // Parse once and then continue parsing as long as possible until failure. 
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
  // Wraps the underlying parser we want to speculatively parse.
  constructor(private parser : Parser) { 
    super(); 
    if (!this.is_not_null(parser)) { throw new Error(); }
  }
  // Always succeeds so either returns an array with one element or an empty array.
  // Not sure if there is a better way to do this.
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
  // Generate and keep the parser during construction.
  private kleene_star_parser : Parser;
  // Wrap the parser so we can call it zero or more times.
  constructor(parser : Parser) { 
    super(); 
    if (!this.is_not_null(parser)) { throw new Error(); }
    this.kleene_star_parser = parser.many().optional();
  }
  // We can just delegate to existing definitions so no need to define it from scratch.
  parse(input : IndexableContext) : Array<any> {
    return this.kleene_star_parser.parse(input);
  }
}
// Basically we have something that will generate a parser so we generate the parser by calling this
// and then use that to parse the input.
class DelayedParser extends Parser {
  // Wrap the generator.
  constructor(private producer : ParserProducer) { 
    super(); 
    if (!this.is_not_null(producer)) { throw new Error(); }
  }
  // Pass the context to the generator and then use the result of that as the parser.
  parse(input : IndexableContext) : any {
    var parser : Parser = this.producer(input);
    return parser.parse(input);
  }
}
