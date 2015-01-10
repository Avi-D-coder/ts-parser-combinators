task :default => 'main.js'

task :clean do
  sh "rm *.js *.map"
end

task 'main.js' => ['examples/example.ts', 'combinators.ts'] do
  sh "tsc --noImplicitAny --sourcemap --out main.js examples/example.ts"
end
