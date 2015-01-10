task :default => 'main.js'

task :clean do
  sh "rm *.js *.map"
end

task 'main.js' => ['examples/sexpr.ts', 'combinators.ts'] do
  sh "tsc --noImplicitAny --sourcemap --out main.js examples/sexpr.ts"
end
