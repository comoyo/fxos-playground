gulp = require("gulp")
watch = require("gulp-watch")
stylus = require("gulp-stylus")
react = require("gulp-react")
browserify = require("gulp-browserify")
rename = require("gulp-rename")
clean = require("gulp-clean")
coffee = require("gulp-coffee")
plumber = require("gulp-plumber")
gutil = require("gulp-util")

errorHandler = (e) ->
  gutil.log e
  gutil.beep()
  return true

watchHelper = (pattern, task) ->
  gulp.src(pattern)
  .pipe watch ->
    gulp.start task

gulp.task "coffee", ->
  gulp.src("lib/*.coffee", {base: '.'})
  .pipe(plumber())
  .pipe(coffee(bare: true))
  .on("error", errorHandler)
  .pipe gulp.dest("./dist/")

gulp.task "coffeex", ->
  gulp.src("lib/*.coffeex", {base: '.'})
  .pipe(plumber())
  .pipe(coffee(bare: true))
  #.on("error", errorHandler)
  .pipe(rename(ext: ".jsx"))
  .pipe(react())
  #.on("error", errorHandler)
  .pipe gulp.dest("./dist/")

gulp.task "stylus", ->
  gulp.src("style/*.styl")
  .pipe(stylus())
  .on("error", errorHandler)
  .pipe gulp.dest("./style/")

gulp.task 'copy', ->
  gulp.src ['./etc/*','package.json', 'index.html', 'manifest.webapp'], {base: '.'}
    .pipe gulp.dest('./dist')

gulp.task "browserify", ["coffee", "coffeex"], ->
  gulp.src("./dist/lib/lunchtime.js", read: false)
  .pipe(browserify({debug: true}))
  .on("error", errorHandler)
  .pipe(rename("bundle.js"))
  .pipe gulp.dest("./dist/lib")

gulp.task "build", ["stylus", "copy", "browserify"]

gulp.task "dev", ["build"], ->
  watchHelper "style/*.styl", "stylus"
  watchHelper "lib/*.coffee", "browserify"
  watchHelper "lib/*.coffeex", "browserify"
  watchHelper ['./etc/*','package.json', 'index.html', 'manifest.webapp'], "copy"
  watchHelper ["lib/*.js", "etc/*", "dist/*.js", "!dist/bundle.js"], "browserify"

gulp.task "clean", ->
  gulp.src(["dist/**/*.*"], read: false)
  .pipe clean()

gulp.task "default", ["build"], ->
