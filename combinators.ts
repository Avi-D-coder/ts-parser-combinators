/* The MIT License (MIT)

Copyright (c) 2015 david karapetyan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */

// Generic predicate. The fundamental parsers delegate to matchers when deciding whether to
// accept or reject something in the input stream.
type Matcher = (input: any) => boolean
// If we only parsed the input and did nothing with it then we would just have recognizers.
// This is just a generic function interface for transforming parsed input.
type Transformation = (input: any) => any
// Wrapping generation of a parser in a function is the easiest way to make it recursive and also
// allow it to refer to rules that have not yet been created.
type ParserProducer = (input: IndexableContext) => Parser
// Event code blocks. Takes the context and any relevant results.
type EventCodeBlock = (input: IndexableContext, result: any) => void
// Guard code block.
type GuardCodeBlock = (input: IndexableContext) => boolean
// Indexable object. The parsers deal with it indirectly through IndexableContext instances.
interface Indexable {
  [index: number]: any
}
// Wraps an Indexable object and keeps a pointer into the underlying stream for rewinding when
// there are failures during the parsing process.
class IndexableContext {
  // Where we are in the input stream.
  public current_index: number
  // The actual element the index is pointing to.
  public current_element: any
  // Keep a cache of parser results;
  public cache: any
  // Cut point prevents backtracking beyond this point.
  private cut_point: number
  // Description of why the cut was placed.
  private cut_reason: string
  // Wraps an array-like object that supports integer indexing.
  constructor(private input: Indexable) {
    this.current_index = 0
    this.current_element = input[this.current_index]
    this.cache = {}
  }
  public cut(reason: string): void {
    this.cut_point = this.current_index
    this.cut_reason = reason
  }
  // Go forward 1 in the input stream.
  public advance(): void {
    this.current_index += 1
    this.current_element = this.input[this.current_index]
  }
  // Reset the index to the given number. Used when parsers need to rewind.
  public reset(index: number): void {
    if (index < this.cut_point) {
      // tslint:disable-next-line:no-console
      console.error('Cut point: ', this.cut_point, '. Cut reason: ', this.cut_reason, '. Backtrack point: ', index)
      throw new Error('Can not backtrack beyond current cut point.')
    }
    this.current_index = index
    this.current_element = this.input[this.current_index]
  }
}

// The base class for all the parsers.
class Parser {
  // Give parsers a name so that web tools can give us the name when we look at the stack.
  public name: string
  public set_name(n: string): this {
    this.name = n
    return this
  }
  // Must be implemented in the subclasses.
  public parse(input: IndexableContext): any { throw new Error('Must implement in subclass.') }
  // Convenience method for alternation.
  public or(other: Parser): Parser {
    return new AlternationParser(this, other)
  }
  // Convenience method for sequencing.
  public then(other: Parser): Parser {
    return new SequenceParser(this, other)
  }
  // Convenience method for generating a transforming parser.
  public transformer(transformation: Transformation): Parser {
    return new TransformParser(this, transformation)
  }
  // Repeat something at least once.
  public many(): Parser {
    return new ManyParser(this)
  }
  // Succeed zero or one time.
  public optional(): Parser {
    return new OptionalParser(this)
  }
  // Kleene start.
  public zero_or_more(): Parser {
    return new KleeneStarParser(this)
  }
  // Positive lookahead.
  public affirm(): Parser {
    return new PositiveLookaheadParser(this)
  }
  // Negative lookahead.
  public deny(): Parser {
    return new NegativeLookaheadParser(this)
  }
  // A block of code to run before running the parser.
  public on_enter(block: EventCodeBlock): OnEnterParser {
    return new OnEnterParser(this, block)
  }
  // A block of code to run if the parsing results are not null.
  public on_success(block: EventCodeBlock): OnSuccessParser {
    return new OnSuccessParser(this, block)
  }
  // A block of code to run if the parsing results are null.
  public on_failure(block: EventCodeBlock): OnFailureParser {
    return new OnFailureParser(this, block)
  }
  // Run after parsing with the wrapped parser.
  public on_exit(block: EventCodeBlock): OnExitParser {
    return new OnExitParser(this, block)
  }
  // Add a cache to the parser so that it is not invoked at the same position more than once.
  public cache(): CachingParser {
    return new CachingParser(this)
  }
  // Generate a guard for this parser so that we only invoke it if the guard suceeds.
  public guard(block: GuardCodeBlock): GuardParser {
    return new GuardParser(this, block)
  }
  // Place a cut to prevent backtracking.
  public cut(reason: string): CutParser {
    return new CutParser(this, reason)
  }
  // We only care about null/undefined values when parsing because that indicates failure.
  public is_not_null(obj: any): boolean {
    return !(null === obj || undefined === obj)
  }
  public is_null(obj: any): boolean {
    return null === obj || undefined === obj
  }
  // Convenience method for wrapping indexable into a context and calling parse on it.
  public parse_input(input: Indexable): any {
    return this.parse(new IndexableContext(input))
  }
  // Convenience method so that we don't have to type "new BasicParser" over and over.
  public static m(matcher: Matcher): Parser {
    return new BasicParser(matcher)
  }
  // Delayed parser generator. Currently the only way to achieve recursion.
  public static delay(producer: ParserProducer): Parser {
    return new DelayedParser(producer)
  }
}
// Basic parser that just calls the matcher and advances the input or returns a failure.
class BasicParser extends Parser {
  // The basic parser is a wrapper around a matcher that drives the context based on the result
  // of the matcher.
  constructor(private matcher: Matcher) {
    super()
    if (this.is_null(matcher)) { throw new Error() }
  }
  // Advance and return the element if matcher succeeds and return null otherwise.
  public parse(input: IndexableContext): any {
    let current_element: any = input.current_element
    if (this.is_not_null(current_element) && this.matcher(current_element)) {
      input.advance(); return current_element
    }
    return null
  }
}
class OnExitParser extends Parser {
  constructor(private parser: Parser, private block: EventCodeBlock) {
    super()
    if (this.is_null(block)) { throw new Error() }
  }
  public parse(input: IndexableContext): any {
    let result = this.parser.parse(input)
    this.block(input, result)
    return result
  }
}
// Parse and if successful place a cut to prevent backtracking.
class CutParser extends Parser {
  constructor(private parser: Parser, private reason: string) {
    super()
  }
  public parse(input: IndexableContext): any {
    let result = this.parser.parse(input)
    if (result !== null) {
      input.cut(this.reason)
    }
    return result
  }
}
// Caches the results of the parser it wraps.
class CachingParser extends Parser {
  constructor(private parser: Parser) {
    super()
  }
  public parse(input: IndexableContext): any {
    if (!input.cache[this as any]) {
      input.cache[this as any] = {}
    }
    let cache: any = input.cache[this as any]
    if (cache[input.current_index] === undefined) {
      let starting_index = input.current_index
      let result = this.parser.parse(input)
      let ending_index = input.current_index
      cache[starting_index] = [result, ending_index]
      return result
    }
    let result_pair = cache[input.current_index]
    input.reset(result_pair[1])
    return result_pair[0]
  }
}
// Verify some condition before calling the parser.
class GuardParser extends Parser {
  constructor(private parser: Parser, private block: GuardCodeBlock) {
    super()
    if (this.is_null(block)) { throw new Error() }
  }
  public parse(input: IndexableContext): any {
    if (this.block(input)) {
      return this.parser.parse(input)
    }
    return null
  }
}
// Only call the code block if the result is null.
class OnFailureParser extends Parser {
  constructor(private parser: Parser, private block: EventCodeBlock) {
    super()
    if (this.is_null(block)) { throw new Error() }
  }
  public parse(input: IndexableContext): any {
    let result = this.parser.parse(input)
    if (this.is_null(result)) {
      this.block(input, result)
    }
    return result
  }
}
// Only call the code block if the result is not null.
class OnSuccessParser extends Parser {
  constructor(private parser: Parser, private block: EventCodeBlock) {
    super()
    if (this.is_null(block)) { throw new Error() }
  }
  public parse(input: IndexableContext): any {
    let result = this.parser.parse(input)
    if (this.is_not_null(result)) {
      this.block(input, result)
    }
    return result
  }
}
// Pretty basic implementation. Just run the code before calling the parser.
class OnEnterParser extends Parser {
  constructor(private parser: Parser, private block: EventCodeBlock) {
    super()
    if (this.is_null(block)) { throw new Error() }
  }
  public parse(input: IndexableContext): any {
    this.block(input, null)
    return this.parser.parse(input)
  }
}
// Try to parse and if successful reset the counter and return parsed value.
class PositiveLookaheadParser extends Parser {
  constructor(private parser: Parser) { super() }
  public parse(input: IndexableContext): any {
    let current_index = input.current_index
    let result = this.parser.parse(input)
    if (result) {
      input.reset(current_index)
      return result
    } else {
      return null
    }
  }
}
// Dual of the above. Return null if successful and true otherwise after resetting the counter.
class NegativeLookaheadParser extends Parser {
  constructor(private parser: Parser) { super() }
  public parse(input: IndexableContext): any {
    let current_index = input.current_index
    let result = this.parser.parse(input)
    if (result) {
      return null
    } else {
      input.reset(current_index)
      return true
    }
  }
}
// Corresponds to "e | f".
class AlternationParser extends Parser {
  // Keep the altenratives in an array.
  private alternatives: Parser[]
  // We always start with at least two parsers.
  constructor(left: Parser, right: Parser) {
    super()
    if (this.is_null(left)) { throw new Error() }
    if (this.is_null(right)) { throw new Error() }
    this.alternatives = [left, right]
  }
  // Override or to append to the current list of parsers and return self for easy chaining.
  public or(other: Parser): Parser {
    this.alternatives.push(other)
    return this
  }
  // Keep trying to parse until we run out of parsers. Make sure to reset after every failure.
  public parse(input: IndexableContext): any {
    let current_index: number = input.current_index
    let parser_index = 0
    let result: any = null
    while (this.alternatives[parser_index] && this.is_null(result)) {
      input.reset(current_index)
      result = this.alternatives[parser_index].parse(input)
      parser_index += 1
    }
    return result
  }
}
// Corresponds to "e f".
class SequenceParser extends Parser {
  // Same as for parsing alternatives we keep the sequence of parsers in an array.
  private sequence: Parser[]
  // We always start with a sequence of at least two parsers.
  constructor(left: Parser, right: Parser) {
    super()
    if (this.is_null(left)) { throw new Error() }
    if (this.is_null(right)) { throw new Error() }
    this.sequence = [left, right]
  }
  // Override then to append to the current parser sequence and return self for easy chaining.
  public then(other: Parser): Parser {
    this.sequence.push(other)
    return this
  }
  // Keep parsing and accumulating results as long as there are parsers and return null if any fail.
  public parse(input: IndexableContext): any[] {
    let parser_index = 0
    let result_accumulator: any[] = []
    while (this.sequence[parser_index]) {
      let parse_result: any = this.sequence[parser_index].parse(input)
      if (this.is_not_null(parse_result)) {
        result_accumulator.push(parse_result)
        parser_index += 1
      } else {
        return null
      }
    }
    return result_accumulator
  }
}
// Transforms the matched results.
class TransformParser extends Parser {
  // Wraps the parser and the corresponding transformation.
  constructor(private parser: Parser, private transform: Transformation) {
    super()
    if (this.is_null(parser)) { throw new Error() }
    if (this.is_null(transform)) { throw new Error() }
  }
  // Parse and pass the non-null results to the transformer and return that as the result.
  // Note: returning null from the transformer indicates failure and is probably not desired.
  public parse(input: IndexableContext): any {
    let result: any = this.parser.parse(input)
    if (this.is_not_null(result)) {
      return this.transform(result)
    }
    return null
  }
}
// Greedly parse as many times as possible. Corresponds to "e+".
class ManyParser extends Parser {
  // Wraps the underlying parser so that it can be used as many times as possible.
  constructor(private parser: Parser) {
    super()
    if (this.is_null(parser)) { throw new Error() }
  }
  // Parse once and then continue parsing as long as possible until failure.
  public parse(input: IndexableContext): any[] {
    let accumulator: any[] = []
    let first_result: any = this.parser.parse(input)
    if (this.is_not_null(first_result)) {
      accumulator.push(first_result)
      let current_index = input.current_index
      let result: any = this.parser.parse(input)
      while (this.is_not_null(result)) {
        accumulator.push(result)
        current_index = input.current_index
        result = this.parser.parse(input)
      }
      input.reset(current_index)
      return accumulator
    }
    return null
  }
}
// Corresponds to "e?". Always succeeds by returning either an empty array or an array with one element.
class OptionalParser extends Parser {
  // Wraps the underlying parser we want to speculatively parse.
  constructor(private parser: Parser) {
    super()
    if (this.is_null(parser)) { throw new Error() }
  }
  // Always succeeds so either returns an array with one element or an empty array.
  // Not sure if there is a better way to do this.
  public parse(input: IndexableContext): any[] {
    let current_index: number = input.current_index
    let result: any = this.parser.parse(input)
    if (this.is_not_null(result)) {
      return result
    } else {
      input.reset(current_index)
    }
    return []
  }
}
// Corresponds to "e*".
class KleeneStarParser extends Parser {
  // Generate and keep the parser during construction.
  private kleene_star_parser: Parser
  // Wrap the parser so we can call it zero or more times.
  constructor(parser: Parser) {
    super()
    if (this.is_null(parser)) { throw new Error() }
    this.kleene_star_parser = parser.many().optional()
  }
  // We can just delegate to existing definitions so no need to define it from scratch.
  public parse(input: IndexableContext): any[] {
    return this.kleene_star_parser.parse(input)
  }
}
// Basically we have something that will generate a parser so we generate the parser by calling this
// and then use that to parse the input.
class DelayedParser extends Parser {
  // Wrap the generator.
  constructor(private producer: ParserProducer) {
    super()
    if (this.is_null(producer)) { throw new Error() }
  }
  // Pass the context to the generator and then use the result of that as the parser.
  public parse(input: IndexableContext): any {
    let parser: Parser = this.producer(input)
    return parser.parse(input)
  }
}
