var browserify, clean, coffee, errorHandler, gulp, gutil, livereload, plumber, react, rename, s3
  , stylus, uglify, watch, watchHelper;

gulp = require("gulp");
watch = require("gulp-watch");
stylus = require("gulp-stylus");
react = require("gulp-react");
browserify = require("gulp-browserify");
rename = require("gulp-rename");
clean = require("gulp-rimraf");
coffee = require("gulp-coffee");
plumber = require("gulp-plumber");
gutil = require("gulp-util");
livereload = require("gulp-livereload");
uglify = require("gulp-uglify");
s3 = require("gulp-s3");

errorHandler = function(e) {
  gutil.log(e);
  gutil.beep();
  return true;
};

watchHelper = function(pattern, task) {
  return gulp.src(pattern)
  .pipe(watch(function() {
    return gulp.start(task);
  }));
};

gulp.task("coffee", function() {
  return gulp.src("lib/*.coffee", {base: '.'})
  .pipe(plumber()).pipe(coffee({bare: true}))
  .on("error", errorHandler)
  .pipe(gulp.dest("./obj/"));
});

gulp.task("coffeex", function() {
  return gulp.src("lib/*.coffeex", {base: '.'})
  .pipe(plumber())
  .pipe(coffee({bare: true}))
  .pipe(rename({ext: ".jsx"}))
  .pipe(react())
  .pipe(gulp.dest("./obj/"));
});

gulp.task("stylus", function() {
  return gulp.src("style/*.styl", {base: '.'})
  .pipe(stylus())
  .on("error", errorHandler)
  .pipe(gulp.dest("./dist/"));
});

gulp.task('copy', function() {
  return gulp.src([
    './etc/*',
    'package.json',
    'index.html',
    'index.debug.html',
    'manifest.webapp',
    'favicon.png',
    'ios/**']
    ,{base: '.'})
  .pipe(gulp.dest('./dist'))
  .pipe(gulp.dest('./obj'));
});

gulp.task("browserify", ["coffee", "coffeex"], function() {
  return gulp.src("./obj/lib/lunchtime.js", {read: false})
  .pipe(browserify({debug: false, transform: ['debowerify']}))
  .on("error", errorHandler)
  .pipe(uglify())
  .pipe(rename("bundle.min.js"))
  .pipe(gulp.dest("./dist/lib"));
});

gulp.task("browserifySourceMaps", ["coffee", "coffeex"], function() {
  return gulp.src("./obj/lib/lunchtime.js", {read: false})
  .pipe(browserify({debug: true, transform: ['debowerify']}))
  .on("error", errorHandler)
  .pipe(rename("bundle.js"))
  .pipe(gulp.dest("./dist/lib"));
});

gulp.task("build", ["stylus", "copy", "browserifySourceMaps", "browserify"]);

gulp.task("dev", ["build"], function() {
  watchHelper("style/*.styl", "stylus");
  watchHelper(['./etc/*', 'package.json', 'index.html', 'index.debug.html', 'manifest.webapp']
    , "copy");
  watchHelper(["lib/*.js", "etc/*", "dist/*.js", "!dist/bundle.js", "lib/*.coffee", "lib/*.coffeex"]
    , "browserifySourceMaps");
  return gulp.start("livereload");
});

gulp.task('livereload', function() {
  var server;
  console.log("Starting live reload server");
  server = livereload();
  return gulp.watch("./dist/**").on('change', function(file) {
    return server.changed(file.path);
  });
});

gulp.task("clean", function() {
  return gulp.src(["dist/", "obj/"], {read: false})
  .pipe(clean());
});

gulp.task("deploy", ["clean"], function() {
  return gulp.start("__deployBuild");
});

gulp.task("__deployBuild", ["build"], function() {
  return gulp.start("__realDeploy");
});

gulp.task("__realDeploy", function() {
  var aws, options;
  aws = require("./aws.json");
  options = {
    delay: 0,
    uploadPath: "lunchtime/"
  };
  return gulp.src('./dist/**', {read: false})
  .pipe(s3(aws, options));
});

gulp.task("default", ["build"]);
