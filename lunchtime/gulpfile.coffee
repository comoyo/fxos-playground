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
livereload = require("gulp-livereload")
uglify = require("gulp-uglify")

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
  .pipe(rename(ext: ".jsx"))
  .pipe(react())
  .pipe gulp.dest("./dist/")

gulp.task "stylus", ->
  gulp.src("style/*.styl", {base: '.'})
  .pipe(stylus())
  .on("error", errorHandler)
  .pipe gulp.dest("./dist/")

gulp.task 'copy', ->
  gulp.src ['./etc/*','package.json', 'index.html', 'manifest.webapp'], {base: '.'}
    .pipe gulp.dest('./dist')

gulp.task "browserify", ["coffee", "coffeex"], ->
  gulp.src("./dist/lib/lunchtime.js", read: false)
  .pipe(browserify({debug: false}))
  .on("error", errorHandler)
  .pipe(uglify())
  .pipe(rename("bundle.min.js"))
  .pipe gulp.dest("./dist/lib")

gulp.task "browserifySourceMaps", ["coffee", "coffeex"], ->
  gulp.src("./dist/lib/lunchtime.js", read: false)
  .pipe(browserify({debug: true}))
  .on("error", errorHandler)
  .pipe(rename("bundle.js"))
  .pipe gulp.dest("./dist/lib")

gulp.task "build", ["stylus", "copy", "browserifySourceMaps", "browserify"]

gulp.task "dev", ["build"], ->
  watchHelper "style/*.styl", "stylus"
  watchHelper "lib/*.coffee", "browserify"
  watchHelper "lib/*.coffeex", "browserify"
  watchHelper ['./etc/*','package.json', 'index.html', 'manifest.webapp'], "copy"
  watchHelper ["lib/*.js", "etc/*", "dist/*.js", "!dist/bundle.js"], "browserify"
  gulp.start "livereload"

gulp.task 'livereload', ->
  console.log "Starting live reload server"
  server = livereload()
  gulp.watch "./dist/**"
    .on 'change', (file) ->
      server.changed file.path

gulp.task "clean", ->
  gulp.src(["dist/**/*.*"], read: false)
  .pipe clean()

gulp.task "default", ["build"], ->
