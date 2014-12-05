task :default => 'main.js'

task :clean do
  sh "rm *.js *.map"
end

task 'main.js' => ['example.ts', 'combinators.ts'] do
  sh "tsc --noImplicitAny --sourcemap --out main.js example.ts"
end
