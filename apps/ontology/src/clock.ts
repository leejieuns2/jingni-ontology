// Anchors the process clock at COURSE_NOW, so course material written against a
// fixed date still behaves as "now". The offset is computed once at startup and
// time then advances at the normal rate from that anchor — it is not frozen.
//
// Import this before anything else (see index.ts): the override has to be in
// place before any handler, query or action reads the time.
//
// No-op when COURSE_NOW is unset, which leaves the real clock alone.
const anchor = process.env["COURSE_NOW"];

if (anchor) {
  const anchorMs = new Date(anchor).getTime();
  if (Number.isNaN(anchorMs)) {
    throw new Error(`COURSE_NOW is not a valid datetime: "${anchor}"`);
  }

  const RealDate = Date;
  const offset = anchorMs - RealDate.now();
  const anchoredNow = () => RealDate.now() + offset;

  // A Proxy rather than a subclass: `instanceof`, `Date.prototype` and every
  // static (`parse`, `UTC`, ...) keep working untouched, and only the two
  // "what time is it now" entry points are redirected.
  globalThis.Date = new Proxy(RealDate, {
    // `new Date()` reports the anchored time; `new Date(value)` still parses.
    construct(target, args) {
      return Reflect.construct(target, args.length === 0 ? [anchoredNow()] : args);
    },
    // `Date()` without `new` returns the current time as a string.
    apply() {
      return new RealDate(anchoredNow()).toString();
    },
    get(target, property, receiver) {
      return property === "now" ? anchoredNow : Reflect.get(target, property, receiver);
    },
  }) as DateConstructor;

  console.log(`clock anchored at ${new Date().toISOString()} (COURSE_NOW=${anchor})`);
}
