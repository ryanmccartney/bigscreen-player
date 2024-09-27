/**
 * Provides an enumeration of possible media states.
 */
const MediaState = {
    /** Media is stopped and is not attempting to start. */
    STOPPED: 0,
    /** Media is paused. */
    PAUSED: 1,
    /** Media is playing successfully. */
    PLAYING: 2,
    /** Media is waiting for data (buffering). */
    WAITING: 4,
    /** Media has ended. */
    ENDED: 5,
    /** Media has thrown a fatal error. */
    FATAL_ERROR: 6,
};

/**
 * Enums for WindowTypes
 * @readonly
 * @enum {string}
 */
const WindowTypes = {
    /** Media with a duration */
    STATIC: "staticWindow",
    /** Media with a start time but without a duration until an indeterminate time in the future */
    GROWING: "growingWindow",
    /** Media with a rewind window that progresses through a media timeline */
    SLIDING: "slidingWindow",
};

function PluginData(args) {
  this.status = args.status;
  this.stateType = args.stateType;
  this.isBufferingTimeoutError = args.isBufferingTimeoutError || false;
  this.isInitialPlay = args.isInitialPlay;
  this.cdn = args.cdn;
  this.newCdn = args.newCdn;
  this.timeStamp = new Date();
  this.code = args.code;
  this.message = args.message;
}

var PluginEnums = {
  STATUS: {
    STARTED: "started",
    DISMISSED: "dismissed",
    FATAL: "fatal",
    FAILOVER: "failover",
  },
  TYPE: {
    BUFFERING: "buffering",
    ERROR: "error",
  },
  ERROR_CODES: {
    MANIFEST_PARSE: 7,
    BUFFERING_TIMEOUT: 8,
    MANIFEST_LOAD: 9,
  },
  ERROR_MESSAGES: {
    BUFFERING_TIMEOUT: "bigscreen-player-buffering-timeout-error",
    MANIFEST: "bigscreen-player-manifest-error",
  },
};

var Utils = {
  clone: (args) => {
    const clone = {};
    for (const prop in args) {
      if (args.hasOwnProperty(prop)) {
        clone[prop] = args[prop];
      }
    }
    return clone
  },

  deepClone: function (objectToClone) {
    if (!objectToClone) {
      return objectToClone
    }

    let clone, propValue, propName;
    clone = Array.isArray(objectToClone) ? [] : {};
    for (propName in objectToClone) {
      propValue = objectToClone[propName];

      // check for date
      if (propValue && Object.prototype.toString.call(propValue) === "[object Date]") {
        clone[propName] = new Date(propValue);
        continue
      }

      clone[propName] = typeof propValue === "object" ? this.deepClone(propValue) : propValue;
    }
    return clone
  },

  cloneArray: function (arr) {
    const clone = [];

    for (let i = 0, n = arr.length; i < n; i++) {
      clone.push(this.clone(arr[i]));
    }

    return clone
  },

  merge: function () {
    const merged = {};

    for (let i = 0; i < arguments.length; i++) {
      const obj = arguments[i];
      for (const prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          if (Object.prototype.toString.call(obj[prop]) === "[object Object]") {
            merged[prop] = this.merge(merged[prop], obj[prop]);
          } else {
            merged[prop] = obj[prop];
          }
        }
      }
    }

    return merged
  },

  arrayStartsWith: (array, partial) => {
    for (let i = 0; i < partial.length; i++) {
      if (array[i] !== partial[i]) {
        return false
      }
    }

    return true
  },

  find: (array, predicate) => {
    return array.reduce((acc, it, i) => {
      return acc !== false ? acc : predicate(it) && it
    }, false)
  },

  findIndex: (array, predicate) => {
    return array.reduce((acc, it, i) => {
      return acc !== false ? acc : predicate(it) && i
    }, false)
  },

  swap: (array, i, j) => {
    const arr = array.slice();
    const temp = arr[i];

    arr[i] = arr[j];
    arr[j] = temp;

    return arr
  },

  pluck: (array, property) => {
    const plucked = [];

    for (let i = 0; i < array.length; i++) {
      plucked.push(array[i][property]);
    }

    return plucked
  },

  flatten: (arr) => [].concat.apply([], arr),

  without: (arr, value) => {
    const newArray = [];

    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== value) {
        newArray.push(arr[i]);
      }
    }

    return newArray
  },

  contains: (arr, subset) => {
    return [].concat(subset).every((item) => {
      return [].concat(arr).indexOf(item) > -1
    })
  },

  pickRandomFromArray: (arr) => {
    return arr[Math.floor(Math.random() * arr.length)]
  },

  filter: (arr, predicate) => {
    const filteredArray = [];

    for (let i = 0; i < arr.length; i++) {
      if (predicate(arr[i])) {
        filteredArray.push(arr[i]);
      }
    }

    return filteredArray
  },

  noop: () => {},

  generateUUID: () => {
    let d = new Date().getTime();

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
  },

  path: (object, keys) => {
    return (keys || []).reduce((accum, key) => {
      return (accum || {})[key]
    }, object || {})
  },
};

function DeferExceptions(callback) {
    try {
        callback();
    }
    catch (error) {
        setTimeout(() => {
            throw error;
        }, 0);
    }
}

function CallCallbacks(callbacks, data) {
    const originalCallbacks = Utils.deepClone(callbacks);
    for (let index = callbacks.length - 1; index >= 0; index--) {
        const originalLength = callbacks.length;
        DeferExceptions(() => callbacks[index](data));
        const newLength = callbacks.length;
        const callbackRemovedSelf = callbacks.indexOf(originalCallbacks[index]) === -1;
        if (originalLength !== newLength && !callbackRemovedSelf) {
            index = index - (originalLength - newLength);
        }
    }
}

let plugins = [];

function callOnAllPlugins(funcKey, evt) {
  const clonedEvent = Utils.deepClone(evt);
  const selectedPlugins = plugins
    .filter((plugin) => plugin[funcKey] && typeof plugin[funcKey] === "function")
    .map((plugin) => plugin[funcKey].bind(plugin));

  CallCallbacks(selectedPlugins, clonedEvent);
}

var Plugins = {
  registerPlugin: (plugin) => {
    plugins.push(plugin);
  },

  unregisterPlugin: (plugin) => {
    if (!plugin && plugins.length > 0) {
      plugins = [];
    } else {
      for (let pluginsIndex = plugins.length - 1; pluginsIndex >= 0; pluginsIndex--) {
        if (plugins[pluginsIndex] === plugin) {
          plugins.splice(pluginsIndex, 1);
        }
      }
    }
  },

  interface: {
    onError: (evt) => callOnAllPlugins("onError", evt),
    onFatalError: (evt) => callOnAllPlugins("onFatalError", evt),
    onErrorCleared: (evt) => callOnAllPlugins("onErrorCleared", evt),
    onErrorHandled: (evt) => callOnAllPlugins("onErrorHandled", evt),
    onBuffering: (evt) => callOnAllPlugins("onBuffering", evt),
    onBufferingCleared: (evt) => callOnAllPlugins("onBufferingCleared", evt),
    onScreenCapabilityDetermined: (tvInfo) => callOnAllPlugins("onScreenCapabilityDetermined", tvInfo),
    onPlayerInfoUpdated: (evt) => callOnAllPlugins("onPlayerInfoUpdated", evt),
    onManifestLoaded: (manifest) => callOnAllPlugins("onManifestLoaded", manifest),
    onManifestParseError: (evt) => callOnAllPlugins("onManifestParseError", evt),
    onQualityChangedRendered: (evt) => callOnAllPlugins("onQualityChangedRendered", evt),
    onSubtitlesLoadError: (evt) => callOnAllPlugins("onSubtitlesLoadError", evt),
    onSubtitlesTimeout: (evt) => callOnAllPlugins("onSubtitlesTimeout", evt),
    onSubtitlesXMLError: (evt) => callOnAllPlugins("onSubtitlesXMLError", evt),
    onSubtitlesTransformError: (evt) => callOnAllPlugins("onSubtitlesTransformError", evt),
    onSubtitlesRenderError: (evt) => callOnAllPlugins("onSubtitlesRenderError", evt),
    onSubtitlesDynamicLoadError: (evt) => callOnAllPlugins("onSubtitlesDynamicLoadError", evt),
    onFragmentContentLengthMismatch: (evt) => callOnAllPlugins("onFragmentContentLengthMismatch", evt),
    onQuotaExceeded: (evt) => callOnAllPlugins("onQuotaExceeded", evt),
  },
};

const TransferFormat = {
    DASH: "dash",
    HLS: "hls",
};

const LiveSupport = {
    NONE: "none",
    PLAYABLE: "playable",
    RESTARTABLE: "restartable",
    SEEKABLE: "seekable",
};

const PlaybackStrategy = {
    MSE: "msestrategy",
    NATIVE: "nativestrategy",
    BASIC: "basicstrategy",
};

function AllowedMediaTransitions(mediaplayer) {
  const player = mediaplayer;

  const MediaPlayerState = {
    EMPTY: "EMPTY", // No source set
    STOPPED: "STOPPED", // Source set but no playback
    BUFFERING: "BUFFERING", // Not enough data to play, waiting to download more
    PLAYING: "PLAYING", // Media is playing
    PAUSED: "PAUSED", // Media is paused
    COMPLETE: "COMPLETE", // Media has reached its end point
    ERROR: "ERROR", // An error occurred
  };

  function canBePaused() {
    const pausableStates = [MediaPlayerState.BUFFERING, MediaPlayerState.PLAYING];

    return pausableStates.indexOf(player.getState()) !== -1
  }

  function canBeStopped() {
    const unstoppableStates = [MediaPlayerState.EMPTY, MediaPlayerState.ERROR];

    const stoppable = unstoppableStates.indexOf(player.getState()) === -1;
    return stoppable
  }

  function canBeginSeek() {
    const unseekableStates = [MediaPlayerState.EMPTY, MediaPlayerState.ERROR];

    const state = player.getState();
    const seekable = state ? unseekableStates.indexOf(state) === -1 : false;

    return seekable
  }

  function canResume() {
    return player.getState() === MediaPlayerState.PAUSED || player.getState() === MediaPlayerState.BUFFERING
  }

  return {
    canBePaused: canBePaused,
    canBeStopped: canBeStopped,
    canBeginSeek: canBeginSeek,
    canResume: canResume,
  }
}

function getValues(obj) {
    const values = [];
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
            continue;
        }
        values.push(obj[key]);
    }
    return values;
}

var EntryCategory;
(function (EntryCategory) {
    EntryCategory["METRIC"] = "metric";
    EntryCategory["MESSAGE"] = "message";
    EntryCategory["TRACE"] = "trace";
})(EntryCategory || (EntryCategory = {}));
const isMessage = (entry) => entry.category === EntryCategory.MESSAGE;
const isMetric = (entry) => entry.category === EntryCategory.METRIC;
const isTrace = (entry) => entry.category === EntryCategory.TRACE;
function isValid(data) {
    const type = typeof data;
    return (type === "boolean" ||
        type === "number" ||
        type === "string" ||
        (type === "object" && Array.isArray(data) && data.every((element) => isValid(element))));
}
function isEqual(left, right) {
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((element, index) => isEqual(element, right[index]));
    }
    return left === right;
}
function sortEntries(someEntry, otherEntry) {
    return someEntry.sessionTime === otherEntry.sessionTime
        ? someEntry.currentElementTime - otherEntry.currentElementTime
        : someEntry.sessionTime - otherEntry.sessionTime;
}
function concatArrays(someArray, otherArray) {
    return [...someArray, ...otherArray];
}
const METRIC_ENTRY_THRESHOLD = 100;
class Chronicle {
    constructor() {
        this.sessionStartTime = Date.now();
        this.currentElementTime = 0;
        this.messages = [];
        this.metrics = {};
        this.traces = [];
        this.listeners = { update: [], timeupdate: [] };
    }
    triggerUpdate(entry) {
        this.listeners.update.forEach((callback) => callback(entry));
    }
    triggerTimeUpdate(seconds) {
        this.listeners.timeupdate.forEach((callback) => callback(seconds));
    }
    timestamp(entry) {
        return Object.assign(Object.assign({}, entry), { currentElementTime: this.currentElementTime, sessionTime: this.getSessionTime() });
    }
    pushMessage(message) {
        const entry = this.timestamp(message);
        this.messages.push(entry);
        this.triggerUpdate(entry);
    }
    getCurrentElementTime() {
        return this.currentElementTime;
    }
    setCurrentElementTime(seconds) {
        this.currentElementTime = seconds;
        this.triggerTimeUpdate(seconds);
    }
    getSessionTime() {
        return Date.now() - this.sessionStartTime;
    }
    on(type, listener) {
        this.listeners[type].push(listener);
    }
    off(type, listener) {
        const index = this.listeners[type].indexOf(listener);
        if (index === -1) {
            return;
        }
        this.listeners[type].splice(index, 1);
    }
    retrieve() {
        const metrics = getValues(this.metrics).reduce(concatArrays, []);
        return [...this.traces, ...metrics, ...this.messages].sort(sortEntries);
    }
    size() {
        return (this.messages.length +
            this.traces.length +
            getValues(this.metrics).reduce((sumSoFar, metricsForKey) => sumSoFar + metricsForKey.length, 0));
    }
    appendMetric(kind, data) {
        if (!isValid(data)) {
            throw new TypeError(`A metric value can only be a primitive type, or an array of any depth containing primitive types. Got ${typeof data}`);
        }
        const latest = this.getLatestMetric(kind);
        if (latest && isEqual(latest.data, data)) {
            return;
        }
        if (this.metrics[kind] == null) {
            this.metrics[kind] = [];
        }
        const metricsForKey = this.metrics[kind];
        if (metricsForKey.length + 1 === METRIC_ENTRY_THRESHOLD) {
            this.trace("error", new Error(`Metric ${kind} exceeded ${METRIC_ENTRY_THRESHOLD}. Consider a more selective sample, or not storing history.`));
        }
        const metric = this.timestamp({ kind, data, category: EntryCategory.METRIC });
        metricsForKey.push(metric);
        this.triggerUpdate(metric);
    }
    setMetric(kind, data) {
        this.metrics[kind] = [];
        this.appendMetric(kind, data);
    }
    getLatestMetric(kind) {
        var _a;
        if (!((_a = this.metrics[kind]) === null || _a === void 0 ? void 0 : _a.length)) {
            return null;
        }
        const metricsForKey = this.metrics[kind];
        return metricsForKey[metricsForKey.length - 1];
    }
    debug(message) {
        this.pushMessage({ category: EntryCategory.MESSAGE, kind: "debug", data: message });
    }
    info(message) {
        this.pushMessage({ category: EntryCategory.MESSAGE, kind: "info", data: message });
    }
    trace(kind, data) {
        const entry = this.timestamp({ kind, data, category: EntryCategory.TRACE });
        this.traces.push(entry);
        this.triggerUpdate(entry);
    }
    warn(message) {
        this.pushMessage({ category: EntryCategory.MESSAGE, kind: "warning", data: message });
    }
}

function addClass(el, className) {
    if (el.classList) {
        el.classList.add(className);
    }
    else {
        el.className += ` ${className}`;
    }
}
function removeClass(el, className) {
    if (el.classList) {
        el.classList.remove(className);
    }
    else {
        el.className = el.className.replace(new RegExp(`(^|\\b)${className.split(" ").join("|")}(\\b|$)`, "gi"), " ");
    }
}
function hasClass(el, className) {
    return el.classList ? el.classList.contains(className) : new RegExp(`(^| )${className}( |$)`, "gi").test(el.className);
}
function isRGBA(rgbaString) {
    return new RegExp("^#([A-Fa-f0-9]{8})$").test(rgbaString);
}
/**
 *  Checks that the string is an RGBA tuple and returns a RGB Tripple.
 *  A string that isn't an RGBA tuple will be returned to the caller.
 */
function rgbaToRGB(rgbaString) {
    return isRGBA(rgbaString) ? rgbaString.slice(0, 7) : rgbaString;
}
/**
 * Safely removes an element from the DOM, simply doing
 * nothing if the node is detached (Has no parent).
 * @param el The Element to remove
 */
function safeRemoveElement(el) {
    if (el && el.parentNode) {
        el.parentNode.removeChild(el);
    }
}
var DOMHelpers = {
    addClass,
    removeClass,
    hasClass,
    rgbaToRGB,
    isRGBA,
    safeRemoveElement,
};

let appElement;
let logBox;
let logContainer;
let staticContainer;
let staticBox;
function init() {
    logBox = document.createElement("div");
    logContainer = document.createElement("span");
    staticBox = document.createElement("div");
    staticContainer = document.createElement("span");
    if (appElement === undefined) {
        appElement = document.body;
    }
    logBox.id = "logBox";
    logBox.style.position = "absolute";
    logBox.style.width = "63%";
    logBox.style.left = "5%";
    logBox.style.top = "15%";
    logBox.style.bottom = "25%";
    logBox.style.backgroundColor = "#1D1D1D";
    logBox.style.opacity = "0.9";
    logBox.style.overflow = "hidden";
    staticBox.id = "staticBox";
    staticBox.style.position = "absolute";
    staticBox.style.width = "30%";
    staticBox.style.right = "1%";
    staticBox.style.top = "15%";
    staticBox.style.bottom = "25%";
    staticBox.style.backgroundColor = "#1D1D1D";
    staticBox.style.opacity = "0.9";
    staticBox.style.overflow = "hidden";
    logContainer.id = "logContainer";
    logContainer.style.color = "#ffffff";
    logContainer.style.fontSize = "11pt";
    logContainer.style.position = "absolute";
    logContainer.style.bottom = "1%";
    logContainer.style.left = "1%";
    logContainer.style.wordWrap = "break-word";
    logContainer.style.whiteSpace = "pre-line";
    staticContainer.id = "staticContainer";
    staticContainer.style.color = "#ffffff";
    staticContainer.style.fontSize = "11pt";
    staticContainer.style.wordWrap = "break-word";
    staticContainer.style.left = "1%";
    staticContainer.style.whiteSpace = "pre-line";
    logBox.appendChild(logContainer);
    staticBox.appendChild(staticContainer);
    appElement.appendChild(logBox);
    appElement.appendChild(staticBox);
}
function setRootElement(root) {
    if (root) {
        appElement = root;
    }
}
function renderDynamicLogs(dynamic) {
    if (logContainer)
        logContainer.textContent = dynamic.join("\n");
}
function renderStaticLogs(staticLogs) {
    staticLogs.forEach((entry) => renderStaticLog(entry));
}
function render({ dynamic: dynamicLogs, static: staticLogs }) {
    renderDynamicLogs(dynamicLogs);
    renderStaticLogs(staticLogs);
}
function renderStaticLog(entry) {
    const { id, key, value } = entry;
    const existingElement = document.querySelector(`#${id}`);
    const text = `${key}: ${value}`;
    if (existingElement == null) {
        createNewStaticElement(entry);
        return;
    }
    if (existingElement.textContent === text) {
        return;
    }
    existingElement.textContent = text;
}
function createNewStaticElement({ id, key, value }) {
    const staticLog = document.createElement("div");
    staticLog.id = id;
    staticLog.style.paddingBottom = "1%";
    staticLog.style.borderBottom = "1px solid white";
    staticLog.textContent = `${key}: ${value}`;
    staticContainer === null || staticContainer === void 0 ? void 0 : staticContainer.appendChild(staticLog);
}
function tearDown() {
    DOMHelpers.safeRemoveElement(logBox);
    DOMHelpers.safeRemoveElement(staticBox);
    appElement = undefined;
    staticContainer = undefined;
    logContainer = undefined;
    logBox = undefined;
}
var DebugView = {
    init,
    setRootElement,
    render,
    tearDown,
};

const invertedMediaState = {
    0: "STOPPED",
    1: "PAUSED",
    2: "PLAYING",
    4: "WAITING",
    5: "ENDED",
    6: "FATAL_ERROR",
};
const DYNAMIC_ENTRY_LIMIT = 29;
function zeroPadHMS(time) {
    return `${time < 10 ? "0" : ""}${time}`;
}
function zeroPadMs(milliseconds) {
    return `${milliseconds < 100 ? "0" : ""}${milliseconds < 10 ? "0" : ""}${milliseconds}`;
}
function formatDate(value) {
    const hours = value.getUTCHours();
    const mins = value.getUTCMinutes();
    const secs = value.getUTCSeconds();
    return `${zeroPadHMS(hours)}:${zeroPadHMS(mins)}:${zeroPadHMS(secs)}`;
}
class DebugViewController {
    constructor() {
        this.isVisible = false;
        this.shouldRender = false;
        this.filters = [];
        this.dynamicEntries = [];
        this.latestMetricByKey = {};
    }
    isMerged(metric) {
        const { kind } = metric;
        const mediaStateMetrics = ["ended", "paused", "ready-state", "seeking"];
        return mediaStateMetrics.includes(kind);
    }
    mergeMediaState(entry) {
        const prevData = this.latestMetricByKey["media-element-state"] == null
            ? {}
            : this.latestMetricByKey["media-element-state"].data;
        const { kind, data } = entry;
        return Object.assign(Object.assign({}, entry), { category: "union", kind: "media-element-state", data: Object.assign(Object.assign({}, prevData), { [kind]: data }) });
    }
    cacheEntry(entry) {
        const { category } = entry;
        switch (category) {
            case EntryCategory.METRIC:
                return this.cacheStaticEntry(this.isMerged(entry) ? this.mergeMediaState(entry) : entry);
            case EntryCategory.MESSAGE:
            case EntryCategory.TRACE:
                this.cacheDynamicEntry(entry);
                if (this.dynamicEntries.length >= DYNAMIC_ENTRY_LIMIT) {
                    this.dynamicEntries = this.dynamicEntries.slice(-DYNAMIC_ENTRY_LIMIT);
                }
                break;
        }
    }
    cacheStaticEntry(entry) {
        var _a;
        const latestSessionTimeSoFar = (_a = this.latestMetricByKey[entry.kind]) === null || _a === void 0 ? void 0 : _a.sessionTime;
        if (typeof latestSessionTimeSoFar === "number" && latestSessionTimeSoFar > entry.sessionTime) {
            return;
        }
        this.latestMetricByKey[entry.kind] = entry;
    }
    cacheDynamicEntry(entry) {
        if (entry.category === "time") {
            this.cacheTimestamp(entry);
            return;
        }
        this.dynamicEntries.push(entry);
    }
    cacheTimestamp(entry) {
        const lastDynamicEntry = this.dynamicEntries[this.dynamicEntries.length - 1];
        if (lastDynamicEntry == null || lastDynamicEntry.category !== "time") {
            this.dynamicEntries.push(entry);
            return;
        }
        this.dynamicEntries[this.dynamicEntries.length - 1] = entry;
    }
    serialiseDynamicEntry(entry) {
        let formattedData;
        const { category } = entry;
        switch (category) {
            case EntryCategory.MESSAGE:
                formattedData = this.serialiseMessage(entry);
                break;
            case "time":
                formattedData = this.serialiseTime(entry);
                break;
            case EntryCategory.TRACE:
                formattedData = this.serialiseTrace(entry);
                break;
        }
        const sessionTime = new Date(entry.sessionTime);
        const formatedSessionTime = `${formatDate(sessionTime)}.${zeroPadMs(sessionTime.getUTCMilliseconds())}`;
        return `${formatedSessionTime} - ${formattedData}`;
    }
    serialiseMessage(message) {
        const { kind, data } = message;
        switch (kind) {
            case "debug":
                return `Debug: ${data}`;
            case "info":
                return `Info: ${data}`;
            case "warning":
                return `Warning: ${data}`;
        }
    }
    serialiseTime(time) {
        const { currentElementTime } = time;
        return `Video time: ${currentElementTime.toFixed(2)}`;
    }
    serialiseTrace(trace) {
        var _a;
        const { currentElementTime, kind, data } = trace;
        switch (kind) {
            case "apicall": {
                const { functionName, functionArgs } = data;
                const argsPart = functionArgs.length === 0 ? "" : ` with args [${functionArgs.join(", ")}]`;
                return `Called '${functionName}${argsPart}'`;
            }
            case "buffered-ranges": {
                const buffered = data.buffered.map(([start, end]) => `${start.toFixed(2)} - ${end.toFixed(2)}`).join(", ");
                return `Buffered ${data.kind}: [${buffered}] at current time ${currentElementTime.toFixed(2)}`;
            }
            case "error":
                return `${(_a = data.name) !== null && _a !== void 0 ? _a : "Error"}: ${data.message}`;
            case "event": {
                const { eventType, eventTarget } = data;
                return `Event: '${eventType}' from ${eventTarget}`;
            }
            case "gap": {
                const { from, to } = data;
                return `Gap from ${from} to ${to}`;
            }
            case "session-start":
                return `Playback session started at ${new Date(data).toISOString().replace("T", " ")}`;
            case "session-end":
                return `Playback session ended at ${new Date(data).toISOString().replace("T", " ")}`;
            case "quota-exceeded": {
                const { bufferLevel, time } = data;
                return `Quota exceeded with buffer level ${bufferLevel} at chunk start time ${time}`;
            }
            case "state-change":
                return `Event: ${invertedMediaState[data]}`;
        }
    }
    serialiseStaticEntry(entry) {
        const { kind } = entry;
        const parsedKey = kind.replace(/-/g, " ");
        const parsedValue = this.serialiseMetric(entry);
        return { id: kind, key: parsedKey, value: parsedValue };
    }
    serialiseMetric({ kind, data }) {
        if (typeof data !== "object") {
            return data;
        }
        if (kind === "media-element-state") {
            const parts = [];
            const isWaiting = typeof data["ready-state"] === "number" && data["ready-state"] <= 2;
            if (!isWaiting && !data.paused && !data.seeking) {
                parts.push("playing");
            }
            if (isWaiting) {
                parts.push("waiting");
            }
            if (data.paused) {
                parts.push("paused");
            }
            if (data.seeking) {
                parts.push("seeking");
            }
            if (data.ended) {
                parts.push("ended");
            }
            return parts.join(", ");
        }
        if (kind === "seekable-range") {
            const [start, end] = data;
            return `${formatDate(new Date(start))} - ${formatDate(new Date(end))}`;
        }
        if (kind === "representation-audio" || kind === "representation-video") {
            const [qualityIndex, bitrate] = data;
            return `${qualityIndex} (${bitrate} kbps)`;
        }
        return data.join(", ");
    }
    render() {
        DebugView.render({
            static: getValues(this.latestMetricByKey).map((entry) => this.serialiseStaticEntry(entry)),
            dynamic: this.dynamicEntries.map((entry) => this.serialiseDynamicEntry(entry)),
        });
    }
    setFilters(filters) {
        this.filters = filters;
    }
    addTime({ currentElementTime, sessionTime }) {
        this.cacheTimestamp({ currentElementTime, sessionTime, category: "time" });
        this.shouldRender = true;
    }
    addEntries(entries) {
        for (const entry of entries) {
            if (!this.filters.every((filter) => filter(entry))) {
                continue;
            }
            this.cacheEntry(entry);
        }
        this.shouldRender = true;
    }
    hideView() {
        clearInterval(this.renderInterval);
        DebugView.tearDown();
        this.isVisible = false;
    }
    showView() {
        DebugView.setRootElement(this.rootElement);
        DebugView.init();
        this.renderInterval = setInterval(() => {
            if (this.shouldRender) {
                this.render();
                this.shouldRender = false;
            }
        }, 250);
        this.isVisible = true;
    }
    setRootElement(el) {
        DebugView.setRootElement(el);
    }
}

const LogLevels = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};
function shouldDisplayEntry(entry) {
    return (!isTrace(entry) ||
        entry.kind !== "event" ||
        entry.data.eventTarget !== "MediaElement" ||
        ["paused", "playing", "seeking", "seeked", "waiting"].includes(entry.data.eventType));
}
function DebugTool() {
    let chronicle = new Chronicle();
    let currentLogLevel = LogLevels.INFO;
    let viewController = new DebugViewController();
    function init() {
        chronicle = new Chronicle();
        viewController = new DebugViewController();
        setLogLevel(LogLevels.INFO);
        chronicle.trace("session-start", Date.now());
    }
    function tearDown() {
        if (viewController.isVisible) {
            hide();
        }
        chronicle.trace("session-end", Date.now());
    }
    function getDebugLogs() {
        return chronicle.retrieve();
    }
    function setLogLevel(newLogLevel) {
        if (typeof newLogLevel !== "number") {
            return;
        }
        if (newLogLevel === LogLevels.DEBUG) {
            viewController.setFilters([]);
        }
        else {
            viewController.setFilters([shouldDisplayEntry]);
        }
        currentLogLevel = newLogLevel;
    }
    function setRootElement(element) {
        viewController.setRootElement(element);
    }
    function updateElementTime(seconds) {
        chronicle.setCurrentElementTime(seconds);
    }
    function apicall(functionName, functionArgs = []) {
        chronicle.trace("apicall", { functionName, functionArgs });
    }
    function buffered(kind, buffered) {
        chronicle.trace("buffered-ranges", { kind, buffered });
    }
    function debug(...parts) {
        if (currentLogLevel < LogLevels.DEBUG) {
            return;
        }
        chronicle.debug(parts.join(" "));
    }
    function error(...parts) {
        if (currentLogLevel < LogLevels.ERROR) {
            return;
        }
        const data = parts.length < 2 ? parts[0] : parts.join(" ");
        chronicle.trace("error", typeof data === "object" && "message" in data ? { name: data.name, message: data.message } : { message: data });
    }
    function event(eventType, eventTarget = "unknown") {
        chronicle.trace("event", { eventTarget, eventType });
    }
    function gap(from, to) {
        chronicle.trace("gap", { from, to });
    }
    function quotaExceeded(bufferLevel, time) {
        chronicle.trace("quota-exceeded", { bufferLevel, time });
    }
    function info(...parts) {
        if (currentLogLevel < LogLevels.INFO) {
            return;
        }
        chronicle.info(parts.join(" "));
    }
    function statechange(value) {
        chronicle.trace("state-change", value);
    }
    function warn(...parts) {
        if (currentLogLevel < LogLevels.WARN) {
            return;
        }
        chronicle.warn(parts.join(" "));
    }
    function dynamicMetric(kind, data) {
        chronicle.appendMetric(kind, data);
    }
    function staticMetric(kind, data) {
        chronicle.setMetric(kind, data);
    }
    function handleHistoryUpdate(change) {
        viewController.addEntries([change]);
    }
    function handleTimeUpdate(seconds) {
        viewController.addTime({ currentElementTime: seconds, sessionTime: chronicle.getSessionTime() });
    }
    function hide() {
        viewController.hideView();
        chronicle.off("update", handleHistoryUpdate);
        chronicle.off("timeupdate", handleTimeUpdate);
    }
    function show() {
        viewController.showView();
        viewController.addEntries(chronicle.retrieve());
        viewController.addTime({
            currentElementTime: chronicle.getCurrentElementTime(),
            sessionTime: chronicle.getSessionTime(),
        });
        chronicle.on("update", handleHistoryUpdate);
        chronicle.on("timeupdate", handleTimeUpdate);
    }
    function toggleVisibility() {
        const toggle = viewController.isVisible ? hide : show;
        toggle();
    }
    return {
        logLevels: LogLevels,
        init,
        tearDown,
        getDebugLogs,
        setLogLevel,
        updateElementTime,
        apicall,
        buffered,
        debug,
        error,
        event,
        gap,
        quotaExceeded,
        info,
        statechange,
        warn,
        dynamicMetric,
        staticMetric,
        hide,
        show,
        setRootElement,
        toggleVisibility,
    };
}
const DebugToolInstance = DebugTool();

function LiveGlitchCurtain(parentElement) {
  let curtain = document.createElement("div");

  curtain.id = "liveGlitchCurtain";
  curtain.style.display = "none";
  curtain.style.position = "absolute";
  curtain.style.top = 0;
  curtain.style.left = 0;
  curtain.style.right = 0;
  curtain.style.bottom = 0;
  curtain.style.backgroundColor = "#3c3c3c";

  return {
    showCurtain: () => {
      curtain.style.display = "block";
      parentElement.appendChild(curtain);
    },

    hideCurtain: () => {
      curtain.style.display = "none";
    },

    tearDown: () => {
      DOMHelpers.safeRemoveElement(curtain);
    },
  }
}

function LegacyPlayerAdapter(mediaSources, windowType, playbackElement, isUHD, player) {
  const EVENT_HISTORY_LENGTH = 2;

  const setSourceOpts = {
    disableSentinels:
      !!isUHD && windowType !== WindowTypes.STATIC && window.bigscreenPlayer?.overrides?.liveUhdDisableSentinels,
    disableSeekSentinel: window.bigscreenPlayer?.overrides?.disableSeekSentinel,
  };

  const timeCorrection = mediaSources.time()?.timeCorrectionSeconds || 0;
  const mediaPlayer = player;
  const eventHistory = [];

  const transitions = new AllowedMediaTransitions(mediaPlayer);

  let isEnded = false;
  let duration = 0;

  let eventCallback;
  let errorCallback;
  let timeUpdateCallback;
  let currentTime;
  let isPaused;
  let hasStartTime;

  let handleErrorOnExitingSeek;
  let delayPauseOnExitSeek;

  let pauseOnExitSeek;
  let exitingSeek;
  let targetSeekToTime;

  let liveGlitchCurtain;

  let strategy = window.bigscreenPlayer && window.bigscreenPlayer.playbackStrategy;

  mediaPlayer.addEventCallback(this, eventHandler);

  strategy = strategy.match(/.+(?=strategy)/g)[0];

  function eventHandler(event) {
    const handleEvent = {
      "playing": onPlaying,
      "paused": onPaused,
      "buffering": onBuffering,
      "seek-attempted": onSeekAttempted,
      "seek-finished": onSeekFinished,
      "status": onTimeUpdate,
      "complete": onEnded,
      "error": onError,
    };

    if (handleEvent.hasOwnProperty(event.type)) {
      handleEvent[event.type].call(this, event);
    } else {
      DebugToolInstance.info(`${getSelection()} Event:${event.type}`);
    }

    if (event.type !== "status") {
      if (eventHistory.length >= EVENT_HISTORY_LENGTH) {
        eventHistory.pop();
      }

      eventHistory.unshift({ type: event.type, time: Date.now() });
    }
  }

  function onPlaying(event) {
    currentTime = event.currentTime - timeCorrection;
    isPaused = false;
    isEnded = false;
    duration = duration || event.duration;
    publishMediaState(MediaState.PLAYING);
  }

  function onPaused(_event) {
    isPaused = true;
    publishMediaState(MediaState.PAUSED);
  }

  function onBuffering(_event) {
    isEnded = false;
    publishMediaState(MediaState.WAITING);
  }

  function onTimeUpdate(event) {
    DebugToolInstance.updateElementTime(event.currentTime);

    isPaused = false;

    // Note: Multiple consecutive CDN failover logic
    // A newly loaded video element will always report a 0 time update
    // This is slightly unhelpful if we want to continue from a later point but consult currentTime as the source of truth.
    if (parseInt(event.currentTime) !== 0) {
      currentTime = event.currentTime - timeCorrection;
    }

    // Must publish this time update before checkSeekSucceded - which could cause a pause event
    // This is a device specific event ordering issue.
    publishTimeUpdate();

    if ((handleErrorOnExitingSeek || delayPauseOnExitSeek) && exitingSeek) {
      checkSeekSucceeded(event.seekableRange.start, event.currentTime);
    }
  }

  function onEnded() {
    isPaused = true;
    isEnded = true;
    publishMediaState(MediaState.ENDED);
  }

  function onError(error) {
    if (handleErrorOnExitingSeek && exitingSeek) {
      restartMediaPlayer();
    } else {
      const mediaError = {
        code: error.code || 0,
        message: error.message || "unknown",
      };
      publishError(mediaError);
    }
  }

  function onSeekAttempted() {
    if (requiresLiveCurtain()) {
      const doNotForceBeginPlaybackToEndOfWindow = {
        forceBeginPlaybackToEndOfWindow: false,
      };

      const streaming = window.bigscreenPlayer || {
        overrides: doNotForceBeginPlaybackToEndOfWindow,
      };

      const overrides = streaming.overrides || doNotForceBeginPlaybackToEndOfWindow;
      const shouldShowCurtain =
        windowType !== WindowTypes.STATIC && (hasStartTime || overrides.forceBeginPlaybackToEndOfWindow);

      if (shouldShowCurtain) {
        liveGlitchCurtain = new LiveGlitchCurtain(playbackElement);
        liveGlitchCurtain.showCurtain();
      }
    }
  }

  function onSeekFinished() {
    if (requiresLiveCurtain() && liveGlitchCurtain) {
      liveGlitchCurtain.hideCurtain();
    }
  }

  function publishMediaState(mediaState) {
    if (eventCallback) {
      eventCallback(mediaState);
    }
  }

  function publishError(mediaError) {
    if (errorCallback) {
      errorCallback(mediaError);
    }
  }

  function publishTimeUpdate() {
    if (timeUpdateCallback) {
      timeUpdateCallback();
    }
  }

  function getStrategy() {
    return strategy.toUpperCase()
  }

  function setupExitSeekWorkarounds(mimeType) {
    handleErrorOnExitingSeek = windowType !== WindowTypes.STATIC && mimeType === "application/dash+xml";

    const deviceFailsPlayAfterPauseOnExitSeek =
      window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.pauseOnExitSeek;
    delayPauseOnExitSeek = handleErrorOnExitingSeek || deviceFailsPlayAfterPauseOnExitSeek;
  }

  function checkSeekSucceeded(seekableRangeStart, currentTime) {
    const SEEK_TOLERANCE = 30;

    const clampedSeekToTime = Math.max(seekableRangeStart, targetSeekToTime);
    const successfullySeeked = Math.abs(currentTime - clampedSeekToTime) < SEEK_TOLERANCE;

    if (successfullySeeked) {
      if (pauseOnExitSeek) {
        // Delay call to pause until seek has completed
        // successfully for scenarios which can error upon exiting seek.
        mediaPlayer.pause();
        pauseOnExitSeek = false;
      }

      exitingSeek = false;
    }
  }

  // Dash live streams can error on exiting seek when the start of the
  // seekable range has overtaken the point where the stream was paused
  // Workaround - reset the media player then do a fresh beginPlaybackFrom()
  function restartMediaPlayer() {
    exitingSeek = false;
    pauseOnExitSeek = false;

    const source = mediaPlayer.getSource();
    const mimeType = mediaPlayer.getMimeType();

    reset();
    mediaPlayer.initialiseMedia("video", source, mimeType, playbackElement, setSourceOpts);
    mediaPlayer.beginPlaybackFrom(currentTime + timeCorrection || 0);
  }

  function requiresLiveCurtain() {
    return !!window.bigscreenPlayer.overrides && !!window.bigscreenPlayer.overrides.showLiveCurtain
  }

  function reset() {
    if (transitions.canBeStopped()) {
      mediaPlayer.stop();
    }

    mediaPlayer.reset();
  }

  return {
    transitions,
    addEventCallback: (thisArg, newCallback) => {
      eventCallback = (event) => newCallback.call(thisArg, event);
    },
    addErrorCallback: (thisArg, newErrorCallback) => {
      errorCallback = (event) => newErrorCallback.call(thisArg, event);
    },
    addTimeUpdateCallback: (thisArg, newTimeUpdateCallback) => {
      timeUpdateCallback = () => newTimeUpdateCallback.call(thisArg);
    },
    load: (mimeType, startTime) => {
      setupExitSeekWorkarounds(mimeType);
      isPaused = false;

      hasStartTime = startTime || startTime === 0;
      const isPlaybackFromLivePoint = windowType !== WindowTypes.STATIC && !hasStartTime;

      mediaPlayer.initialiseMedia("video", mediaSources.currentSource(), mimeType, playbackElement, setSourceOpts);

      if (!isPlaybackFromLivePoint && typeof mediaPlayer.beginPlaybackFrom === "function") {
        currentTime = startTime;
        mediaPlayer.beginPlaybackFrom(startTime + timeCorrection || 0);
      } else {
        mediaPlayer.beginPlayback();
      }
    },
    play: () => {
      isPaused = false;
      if (delayPauseOnExitSeek && exitingSeek) {
        pauseOnExitSeek = false;
      } else {
        if (isEnded) {
          mediaPlayer.playFrom && mediaPlayer.playFrom(0);
        } else if (transitions.canResume()) {
          mediaPlayer.resume();
        } else {
          mediaPlayer.playFrom && mediaPlayer.playFrom(currentTime + timeCorrection);
        }
      }
    },
    pause: (options) => {
      // TODO - transitions is checked in playerComponent. The check can be removed here.
      if (delayPauseOnExitSeek && exitingSeek && transitions.canBePaused()) {
        pauseOnExitSeek = true;
      } else {
        mediaPlayer.pause(options);
      }
    },
    isPaused: () => isPaused,
    isEnded: () => isEnded,
    getDuration: () => duration,
    getPlayerElement: () => mediaPlayer.getPlayerElement && mediaPlayer.getPlayerElement(),
    getSeekableRange: () => {
      if (windowType === WindowTypes.STATIC) {
        return {
          start: 0,
          end: duration,
        }
      }
      const seekableRange = (mediaPlayer.getSeekableRange && mediaPlayer.getSeekableRange()) || {};
      if (seekableRange.hasOwnProperty("start")) {
        seekableRange.start = seekableRange.start - timeCorrection;
      }
      if (seekableRange.hasOwnProperty("end")) {
        seekableRange.end = seekableRange.end - timeCorrection;
      }
      return seekableRange
    },
    setPlaybackRate: (rate) => {
      if (typeof mediaPlayer.setPlaybackRate === "function") {
        mediaPlayer.setPlaybackRate(rate);
      }
    },
    getPlaybackRate: () => {
      if (typeof mediaPlayer.getPlaybackRate === "function") {
        return mediaPlayer.getPlaybackRate()
      }
      return 1
    },
    getCurrentTime: () => currentTime,
    setCurrentTime: (seekToTime) => {
      isEnded = false;
      currentTime = seekToTime;
      const correctedSeekToTime = seekToTime + timeCorrection;

      if (handleErrorOnExitingSeek || delayPauseOnExitSeek) {
        targetSeekToTime = correctedSeekToTime;
        exitingSeek = true;
        pauseOnExitSeek = isPaused;
      }

      mediaPlayer.playFrom && mediaPlayer.playFrom(correctedSeekToTime);
      if (isPaused && !delayPauseOnExitSeek) {
        mediaPlayer.pause();
      }
    },
    getStrategy: getStrategy(),
    reset,
    tearDown: () => {
      mediaPlayer.removeAllEventCallbacks();
      pauseOnExitSeek = false;
      exitingSeek = false;
      pauseOnExitSeek = false;
      delayPauseOnExitSeek = false;
      isPaused = true;
      isEnded = false;
      if (liveGlitchCurtain) {
        liveGlitchCurtain.tearDown();
        liveGlitchCurtain = undefined;
      }
      eventCallback = undefined;
      errorCallback = undefined;
      timeUpdateCallback = undefined;
    },
  }
}

const STATE$1 = {
  EMPTY: "EMPTY", // No source set
  STOPPED: "STOPPED", // Source set but no playback
  BUFFERING: "BUFFERING", // Not enough data to play, waiting to download more
  PLAYING: "PLAYING", // Media is playing
  PAUSED: "PAUSED", // Media is paused
  COMPLETE: "COMPLETE", // Media has reached its end point
  ERROR: "ERROR", // An error occurred
};

const EVENT = {
  STOPPED: "stopped", // Event fired when playback is stopped
  BUFFERING: "buffering", // Event fired when playback has to suspend due to buffering
  PLAYING: "playing", // Event fired when starting (or resuming) playing of the media
  PAUSED: "paused", // Event fired when media playback pauses
  COMPLETE: "complete", // Event fired when media playback has reached the end of the media
  ERROR: "error", // Event fired when an error condition occurs
  STATUS: "status", // Event fired regularly during play
  SENTINEL_ENTER_BUFFERING: "sentinel-enter-buffering", // Event fired when a sentinel has to act because the device has started buffering but not reported it
  SENTINEL_EXIT_BUFFERING: "sentinel-exit-buffering", // Event fired when a sentinel has to act because the device has finished buffering but not reported it
  SENTINEL_PAUSE: "sentinel-pause", // Event fired when a sentinel has to act because the device has failed to pause when expected
  SENTINEL_PLAY: "sentinel-play", // Event fired when a sentinel has to act because the device has failed to play when expected
  SENTINEL_SEEK: "sentinel-seek", // Event fired when a sentinel has to act because the device has failed to seek to the correct location
  SENTINEL_COMPLETE: "sentinel-complete", // Event fired when a sentinel has to act because the device has completed the media but not reported it
  SENTINEL_PAUSE_FAILURE: "sentinel-pause-failure", // Event fired when the pause sentinel has failed twice, so it is giving up
  SENTINEL_SEEK_FAILURE: "sentinel-seek-failure", // Event fired when the seek sentinel has failed twice, so it is giving up
  SEEK_ATTEMPTED: "seek-attempted", // Event fired when a device using a seekfinishedemitevent modifier sets the source
  SEEK_FINISHED: "seek-finished", // Event fired when a device using a seekfinishedemitevent modifier has seeked successfully
};

const TYPE = {
  VIDEO: "video",
  AUDIO: "audio",
  LIVE_VIDEO: "live-video",
  LIVE_AUDIO: "live-audio",
};

function unpausedEventCheck(event) {
  if (event && event.state && event.type !== "status") {
    return event.state !== STATE$1.PAUSED
  } else {
    return undefined
  }
}

var MediaPlayerBase = {
  STATE: STATE$1,
  EVENT: EVENT,
  TYPE: TYPE,
  unpausedEventCheck: unpausedEventCheck,
};

const STATE = {
  STOPPED: 0,
  PLAYING: 1,
  PAUSED: 2,
  CONNECTING: 3,
  BUFFERING: 4,
  FINISHED: 5,
  ERROR: 6,
};

function Cehtml() {
  let eventCallbacks = [];
  let state = MediaPlayerBase.STATE.EMPTY;

  let mediaElement;
  let updateInterval;

  let mediaType;
  let source;
  let mimeType;

  let deferSeekingTo;
  let range;

  let postBufferingState;
  let seekFinished;
  let count;
  let timeoutHappened;

  let disableSentinels;

  let sentinelSeekTime;
  let seekSentinelTolerance;
  let sentinelInterval;
  let sentinelIntervalNumber;
  let timeAtLastSentinelInterval;

  let sentinelTimeIsNearEnd;
  let timeHasAdvanced;

  const sentinelLimits = {
    pause: {
      maximumAttempts: 2,
      successEvent: MediaPlayerBase.EVENT.SENTINEL_PAUSE,
      failureEvent: MediaPlayerBase.EVENT.SENTINEL_PAUSE_FAILURE,
      currentAttemptCount: 0,
    },
    seek: {
      maximumAttempts: 2,
      successEvent: MediaPlayerBase.EVENT.SENTINEL_SEEK,
      failureEvent: MediaPlayerBase.EVENT.SENTINEL_SEEK_FAILURE,
      currentAttemptCount: 0,
    },
  };

  function addEventCallback(thisArg, callback) {
    const eventCallback = (event) => callback.call(thisArg, event);

    eventCallbacks.push({ from: callback, to: eventCallback });
  }

  function removeEventCallback(_thisArg, callback) {
    eventCallbacks = eventCallbacks.filter((cb) => cb.from !== callback);
  }

  function removeAllEventCallbacks() {
    eventCallbacks = [];
  }

  function emitEvent(eventType, eventLabels) {
    const event = {
      type: eventType,
      currentTime: getCurrentTime(),
      seekableRange: getSeekableRange(),
      duration: getDuration(),
      url: getSource(),
      mimeType: getMimeType(),
      state: getState(),
    };

    if (eventLabels) {
      for (const key in eventLabels) {
        if (eventLabels.hasOwnProperty(key)) {
          event[key] = eventLabels[key];
        }
      }
    }

    eventCallbacks.forEach((callback) => callback.to(event));
  }

  function getClampedTime(seconds) {
    const CLAMP_OFFSET_FROM_END_OF_RANGE = 1.1;
    const range = getSeekableRange();
    const nearToEnd = Math.max(range.end - CLAMP_OFFSET_FROM_END_OF_RANGE, range.start);

    if (seconds < range.start) {
      return range.start
    } else if (seconds > nearToEnd) {
      return nearToEnd
    } else {
      return seconds
    }
  }

  function isLiveMedia() {
    return mediaType === MediaPlayerBase.TYPE.LIVE_VIDEO || mediaType === MediaPlayerBase.TYPE.LIVE_AUDIO
  }

  function getSource() {
    return source
  }

  function getMimeType() {
    return mimeType
  }

  function getState() {
    return state
  }

  function setSeekSentinelTolerance() {
    const ON_DEMAND_SEEK_SENTINEL_TOLERANCE = 15;
    const LIVE_SEEK_SENTINEL_TOLERANCE = 30;

    seekSentinelTolerance = ON_DEMAND_SEEK_SENTINEL_TOLERANCE;
    if (isLiveMedia()) {
      seekSentinelTolerance = LIVE_SEEK_SENTINEL_TOLERANCE;
    }
  }

  function initialiseMedia(type, url, mediaMimeType, sourceContainer, opts) {
    opts = opts || {};
    disableSentinels = opts.disableSentinels;
    mediaType = type;
    source = url;
    mimeType = mediaMimeType;

    emitSeekAttempted();

    if (getState() === MediaPlayerBase.STATE.EMPTY) {
      timeAtLastSentinelInterval = 0;
      setSeekSentinelTolerance();
      createElement();
      addElementToDOM();
      mediaElement.data = source;
      registerEventHandlers();
      toStopped();
    } else {
      toError("Cannot set source unless in the '" + MediaPlayerBase.STATE.EMPTY + "' state");
    }
  }

  function resume() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.PLAYING:
      case MediaPlayerBase.STATE.BUFFERING:
        break

      case MediaPlayerBase.STATE.PAUSED:
        mediaElement.play(1);
        toPlaying();
        break

      default:
        toError("Cannot resume while in the '" + getState() + "' state");
        break
    }
  }

  function playFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    sentinelLimits.seek.currentAttemptCount = 0;
    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
        deferSeekingTo = seconds;
        break

      case MediaPlayerBase.STATE.COMPLETE:
        toBuffering();
        mediaElement.stop();
        playAndSetDeferredSeek(seconds);
        break

      case MediaPlayerBase.STATE.PLAYING:
        toBuffering();
        const seekResult = seekTo(seconds);
        if (seekResult === false) {
          toPlaying();
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        toBuffering();
        seekTo(seconds);
        mediaElement.play(1);
        break

      default:
        toError("Cannot playFrom while in the '" + getState() + "' state");
        break
    }
  }

  function getDuration() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        return undefined
      default:
        if (isLiveMedia()) {
          return Infinity
        }
        return getMediaDuration()
    }
  }

  function beginPlayback() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        toBuffering();
        mediaElement.play(1);
        break

      default:
        toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlaybackFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    sentinelLimits.seek.currentAttemptCount = 0;

    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        // Seeking past 0 requires calling play first when media has not been loaded
        toBuffering();
        playAndSetDeferredSeek(seconds);
        break

      default:
        toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function pause() {
    postBufferingState = MediaPlayerBase.STATE.PAUSED;
    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PAUSED:
        break

      case MediaPlayerBase.STATE.PLAYING:
        mediaElement.play(0);
        toPaused();
        break

      default:
        toError("Cannot pause while in the '" + getState() + "' state");
        break
    }
  }

  function stop() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        break

      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PLAYING:
      case MediaPlayerBase.STATE.PAUSED:
      case MediaPlayerBase.STATE.COMPLETE:
        sentinelSeekTime = undefined;
        if (mediaElement.stop) {
          mediaElement.stop();
          toStopped();
        } else {
          toError("mediaElement.stop is not a function : failed to stop the media player");
        }
        break

      default:
        toError("Cannot stop while in the '" + getState() + "' state");
        break
    }
  }

  function reset() {
    switch (getState()) {
      case MediaPlayerBase.STATE.EMPTY:
        break

      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        toEmpty();
        break

      default:
        toError("Cannot reset while in the '" + getState() + "' state");
        break
    }
  }

  function getCurrentTime() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        break

      case MediaPlayerBase.STATE.COMPLETE:
        if (range) {
          return range.end
        }
        break

      default:
        if (mediaElement) {
          return mediaElement.playPosition / 1000
        }
        break
    }
    return undefined
  }

  function getSeekableRange() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        break

      default:
        return range
    }
    return undefined
  }

  function getMediaDuration() {
    if (range) {
      return range.end
    }
    return undefined
  }

  function getPlayerElement() {
    return mediaElement
  }

  function onFinishedBuffering() {
    cacheRange();

    if (getState() !== MediaPlayerBase.STATE.BUFFERING) {
      return
    }

    if (waitingToSeek()) {
      toBuffering();
      performDeferredSeek();
    } else if (waitingToPause()) {
      toPaused();
      mediaElement.play(0);
    } else {
      toPlaying();
    }
  }

  function onDeviceError() {
    reportError("Media element error code: " + mediaElement.error);
  }

  function onDeviceBuffering() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      toBuffering();
    }
  }

  function onEndOfMedia() {
    if (getState() !== MediaPlayerBase.STATE.COMPLETE) {
      toComplete();
    }
  }

  function emitSeekAttempted() {
    if (getState() === MediaPlayerBase.STATE.EMPTY) {
      emitEvent(MediaPlayerBase.EVENT.SEEK_ATTEMPTED);
      seekFinished = false;
    }

    count = 0;
    timeoutHappened = false;
    if (window.bigscreenPlayer && window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.restartTimeout) {
      setTimeout(() => {
        timeoutHappened = true;
      }, window.bigscreenPlayer.overrides.restartTimeout);
    } else {
      timeoutHappened = true;
    }
  }

  function emitSeekFinishedAtCorrectStartingPoint() {
    let isAtCorrectStartingPoint = Math.abs(getCurrentTime() - sentinelSeekTime) <= seekSentinelTolerance;

    if (sentinelSeekTime === undefined) {
      isAtCorrectStartingPoint = true;
    }

    const isPlayingAtCorrectTime = getState() === MediaPlayerBase.STATE.PLAYING && isAtCorrectStartingPoint;

    if (isPlayingAtCorrectTime && count >= 5 && timeoutHappened && !seekFinished) {
      emitEvent(MediaPlayerBase.EVENT.SEEK_FINISHED);
      seekFinished = true;
    } else if (isPlayingAtCorrectTime) {
      count++;
    } else {
      count = 0;
    }
  }

  function onStatus() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      emitEvent(MediaPlayerBase.EVENT.STATUS);
    }

    emitSeekFinishedAtCorrectStartingPoint();
  }

  function createElement() {
    mediaElement = document.createElement("object", "mediaPlayer");
    mediaElement.type = mimeType;
    mediaElement.style.position = "absolute";
    mediaElement.style.top = "0px";
    mediaElement.style.left = "0px";
    mediaElement.style.width = "100%";
    mediaElement.style.height = "100%";
  }

  function registerEventHandlers() {
    const DEVICE_UPDATE_PERIOD_MS = 500;

    mediaElement.onPlayStateChange = () => {
      switch (mediaElement.playState) {
        case STATE.STOPPED:
          break
        case STATE.PLAYING:
          onFinishedBuffering();
          break
        case STATE.PAUSED:
          break
        case STATE.CONNECTING:
          break
        case STATE.BUFFERING:
          onDeviceBuffering();
          break
        case STATE.FINISHED:
          onEndOfMedia();
          break
        case STATE.ERROR:
          onDeviceError();
          break
      }
    };

    updateInterval = setInterval(() => onStatus(), DEVICE_UPDATE_PERIOD_MS);
  }

  function addElementToDOM() {
    const body = document.getElementsByTagName("body")[0];
    body.insertBefore(mediaElement, body.firstChild);
  }

  function cacheRange() {
    if (mediaElement) {
      range = {
        start: 0,
        end: mediaElement.playTime / 1000,
      };
    }
  }

  function playAndSetDeferredSeek(seconds) {
    mediaElement.play(1);
    if (seconds > 0) {
      deferSeekingTo = seconds;
    }
  }

  function waitingToSeek() {
    return deferSeekingTo !== undefined
  }

  function performDeferredSeek() {
    seekTo(deferSeekingTo);
    deferSeekingTo = undefined;
  }

  function seekTo(seconds) {
    const clampedTime = getClampedTime(seconds);

    if (clampedTime !== seconds) {
      DebugToolInstance.info(
        "playFrom " +
          seconds +
          " clamped to " +
          clampedTime +
          " - seekable range is { start: " +
          range.start +
          ", end: " +
          range.end +
          " }"
      );
    }

    sentinelSeekTime = clampedTime;
    return mediaElement.seek(clampedTime * 1000)
  }

  function waitingToPause() {
    return postBufferingState === MediaPlayerBase.STATE.PAUSED
  }

  function wipe() {
    mediaType = undefined;
    source = undefined;
    mimeType = undefined;
    sentinelSeekTime = undefined;
    range = undefined;

    if (mediaElement) {
      clearInterval(updateInterval);
      clearSentinels();
      destroyMediaElement();
    }
  }

  function destroyMediaElement() {
    delete mediaElement.onPlayStateChange;
    DOMHelpers.safeRemoveElement(mediaElement);
    mediaElement = undefined;
  }

  function reportError(errorMessage) {
    DebugToolInstance.info(errorMessage);
    emitEvent(MediaPlayerBase.EVENT.ERROR, { errorMessage: errorMessage });
  }

  function toStopped() {
    state = MediaPlayerBase.STATE.STOPPED;
    emitEvent(MediaPlayerBase.EVENT.STOPPED);
    if (sentinelInterval) {
      clearSentinels();
    }
  }

  function toBuffering() {
    state = MediaPlayerBase.STATE.BUFFERING;
    emitEvent(MediaPlayerBase.EVENT.BUFFERING);
    setSentinels([exitBufferingSentinel]);
  }

  function toPlaying() {
    state = MediaPlayerBase.STATE.PLAYING;
    emitEvent(MediaPlayerBase.EVENT.PLAYING);
    setSentinels([shouldBeSeekedSentinel, enterCompleteSentinel, enterBufferingSentinel]);
  }

  function toPaused() {
    state = MediaPlayerBase.STATE.PAUSED;
    emitEvent(MediaPlayerBase.EVENT.PAUSED);
    setSentinels([shouldBePausedSentinel, shouldBeSeekedSentinel]);
  }

  function toComplete() {
    state = MediaPlayerBase.STATE.COMPLETE;
    emitEvent(MediaPlayerBase.EVENT.COMPLETE);
    clearSentinels();
  }

  function toEmpty() {
    wipe();
    state = MediaPlayerBase.STATE.EMPTY;
  }

  function toError(errorMessage) {
    wipe();
    state = MediaPlayerBase.STATE.ERROR;
    reportError(errorMessage);
  }

  function isNearToEnd(seconds) {
    return getDuration() - seconds <= 1
  }

  function setSentinels(sentinels) {
    if (disableSentinels) {
      return
    }

    sentinelLimits.pause.currentAttemptCount = 0;
    timeAtLastSentinelInterval = getCurrentTime();
    clearSentinels();
    sentinelIntervalNumber = 0;
    sentinelInterval = setInterval(() => {
      const newTime = getCurrentTime();
      sentinelIntervalNumber++;

      timeHasAdvanced = newTime ? newTime > timeAtLastSentinelInterval + 0.2 : false;
      sentinelTimeIsNearEnd = isNearToEnd(newTime || timeAtLastSentinelInterval);

      for (let i = 0; i < sentinels.length; i++) {
        const sentinelActionPerformed = sentinels[i].call(this);
        if (sentinelActionPerformed) {
          break
        }
      }

      timeAtLastSentinelInterval = newTime;
    }, 1100);
  }

  function clearSentinels() {
    clearInterval(sentinelInterval);
  }

  function enterBufferingSentinel() {
    const sentinelBufferingRequired = !timeHasAdvanced && !sentinelTimeIsNearEnd && sentinelIntervalNumber > 1;

    if (sentinelBufferingRequired) {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_ENTER_BUFFERING);
      toBuffering();
    }

    return sentinelBufferingRequired
  }

  function exitBufferingSentinel() {
    const sentinelExitBufferingRequired = timeHasAdvanced;

    if (sentinelExitBufferingRequired) {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_EXIT_BUFFERING);
      onFinishedBuffering();
    }

    return sentinelExitBufferingRequired
  }

  function shouldBeSeekedSentinel() {
    if (sentinelSeekTime === undefined) {
      return false
    }

    const currentTime = getCurrentTime();
    const clampedSentinelSeekTime = getClampedTime(sentinelSeekTime);
    const sentinelSeekRequired = Math.abs(clampedSentinelSeekTime - currentTime) > seekSentinelTolerance;

    let sentinelActionTaken = false;

    if (sentinelSeekRequired) {
      const mediaElement = mediaElement;

      sentinelActionTaken = nextSentinelAttempt(sentinelLimits.seek, () => {
        mediaElement.seek(clampedSentinelSeekTime * 1000);
      });
    } else if (sentinelIntervalNumber < 3) {
      sentinelSeekTime = currentTime;
    } else {
      sentinelSeekTime = undefined;
    }
    return sentinelActionTaken
  }

  function shouldBePausedSentinel() {
    const sentinelPauseRequired = timeHasAdvanced;
    let sentinelActionTaken = false;

    if (sentinelPauseRequired) {
      const mediaElement = mediaElement;

      sentinelActionTaken = nextSentinelAttempt(sentinelLimits.pause, () => {
        mediaElement.play(0);
      });
    }
    return sentinelActionTaken
  }

  function enterCompleteSentinel() {
    const sentinelCompleteRequired = !timeHasAdvanced && sentinelTimeIsNearEnd;

    if (sentinelCompleteRequired) {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_COMPLETE);
      onEndOfMedia();
    }

    return sentinelCompleteRequired
  }

  function nextSentinelAttempt(sentinelInfo, attemptFn) {
    let currentAttemptCount, maxAttemptCount;

    sentinelInfo.currentAttemptCount += 1;
    currentAttemptCount = sentinelInfo.currentAttemptCount;
    maxAttemptCount = sentinelInfo.maximumAttempts;

    if (currentAttemptCount === maxAttemptCount + 1) {
      emitEvent(sentinelInfo.failureEvent);
    }

    if (currentAttemptCount <= maxAttemptCount) {
      attemptFn();
      emitEvent(sentinelInfo.successEvent);
      return true
    }

    return false
  }

  return {
    addEventCallback: addEventCallback,
    removeEventCallback: removeEventCallback,
    removeAllEventCallbacks: removeAllEventCallbacks,
    initialiseMedia: initialiseMedia,
    resume: resume,
    playFrom: playFrom,
    beginPlayback: beginPlayback,
    beginPlaybackFrom: beginPlaybackFrom,
    pause: pause,
    stop: stop,
    reset: reset,
    getSource: getSource,
    getMimeType: getMimeType,
    getSeekableRange: getSeekableRange,
    getMediaDuration: getMediaDuration,
    getState: getState,
    getPlayerElement: getPlayerElement,
    getDuration: getDuration,
  }
}

function handlePlayPromise(playPromise) {
    if (!playPromise || typeof playPromise.catch !== "function")
        return;
    playPromise.catch((error) => {
        if (error && error.name === "AbortError") {
            return;
        }
        throw error;
    });
}

function Html5() {
  const sentinelLimits = {
    pause: {
      maximumAttempts: 2,
      successEvent: MediaPlayerBase.EVENT.SENTINEL_PAUSE,
      failureEvent: MediaPlayerBase.EVENT.SENTINEL_PAUSE_FAILURE,
      currentAttemptCount: 0,
    },
    seek: {
      maximumAttempts: 2,
      successEvent: MediaPlayerBase.EVENT.SENTINEL_SEEK,
      failureEvent: MediaPlayerBase.EVENT.SENTINEL_SEEK_FAILURE,
      currentAttemptCount: 0,
    },
  };

  let eventCallback;
  let eventCallbacks = [];
  let state = MediaPlayerBase.STATE.EMPTY;

  let mediaElement;
  let sourceElement;

  let trustZeroes = false;
  let ignoreNextPauseEvent = false;
  let nearEndOfMedia;
  let readyToPlayFrom;

  let mediaType;
  let source;
  let mimeType;

  let postBufferingState;
  let targetSeekTime;
  let seekFinished;

  let count;
  let timeoutHappened;

  let disableSentinels;
  let disableSeekSentinel;
  let hasSentinelTimeChangedWithinTolerance;
  let enterBufferingSentinelAttemptCount;
  let sentinelSeekTime;
  let seekSentinelTolerance;
  let sentinelInterval;
  let sentinelIntervalNumber;
  let lastSentinelTime;

  let cachedSeekableRange;
  let readyToCache = true;

  function emitEvent(eventType, eventLabels) {
    const event = {
      type: eventType,
      currentTime: getCurrentTime(),
      seekableRange: getSeekableRange(),
      duration: getDuration(),
      url: getSource(),
      mimeType: getMimeType(),
      state: getState(),
    };

    if (eventLabels) {
      for (const key in eventLabels) {
        if (eventLabels.hasOwnProperty(key)) {
          event[key] = eventLabels[key];
        }
      }
    }

    for (let index = 0; index < eventCallbacks.length; index++) {
      eventCallbacks[index](event);
    }
  }

  function getDuration() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        return undefined
      default:
        if (isLiveMedia()) {
          return Infinity
        }
        return getMediaDuration()
    }
  }

  function getSource() {
    return source
  }

  function getMimeType() {
    return mimeType
  }

  function getState() {
    return state
  }

  function isLiveMedia() {
    return mediaType === MediaPlayerBase.TYPE.LIVE_VIDEO || mediaType === MediaPlayerBase.TYPE.LIVE_AUDIO
  }

  function setSeekSentinelTolerance() {
    const ON_DEMAND_SEEK_SENTINEL_TOLERANCE = 15;
    const LIVE_SEEK_SENTINEL_TOLERANCE = 30;

    seekSentinelTolerance = ON_DEMAND_SEEK_SENTINEL_TOLERANCE;

    if (isLiveMedia()) {
      seekSentinelTolerance = LIVE_SEEK_SENTINEL_TOLERANCE;
    }
  }

  function generateSourceElement(url, mimeType) {
    const sourceElement = document.createElement("source");

    sourceElement.src = url;
    sourceElement.type = mimeType;
    return sourceElement
  }

  function appendChildElement(to, el) {
    to.appendChild(el);
  }

  function prependChildElement(to, el) {
    if (to.childNodes.length > 0) {
      to.insertBefore(el, to.childNodes[0]);
    } else {
      to.appendChild(el);
    }
  }

  function toStopped() {
    state = MediaPlayerBase.STATE.STOPPED;
    emitEvent(MediaPlayerBase.EVENT.STOPPED);
    setSentinels([]);
  }

  function enterBufferingSentinel() {
    let sentinelShouldFire = !hasSentinelTimeChangedWithinTolerance && !nearEndOfMedia;

    if (getCurrentTime() === 0) {
      sentinelShouldFire = trustZeroes && sentinelShouldFire;
    }

    if (enterBufferingSentinelAttemptCount === undefined) {
      enterBufferingSentinelAttemptCount = 0;
    }

    if (sentinelShouldFire) {
      enterBufferingSentinelAttemptCount++;
    } else {
      enterBufferingSentinelAttemptCount = 0;
    }

    if (enterBufferingSentinelAttemptCount === 1) {
      sentinelShouldFire = false;
    }

    if (sentinelShouldFire) {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_ENTER_BUFFERING);
      toBuffering();
      /* Resetting the sentinel attempt count to zero means that the sentinel will only fire once
       even if multiple iterations result in the same conditions.
       This should not be needed as the second iteration, when the enter buffering sentinel is fired
       will cause the media player to go into the buffering state. The enter buffering sentinel is not fired
       when in buffering state
       */
      enterBufferingSentinelAttemptCount = 0;
      return true
    }

    return false
  }

  function exitBufferingSentinel() {
    function fireExitBufferingSentinel() {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_EXIT_BUFFERING);
      exitBuffering();
      return true
    }

    if (readyToPlayFrom && mediaElement.paused) {
      return fireExitBufferingSentinel()
    }

    if (hasSentinelTimeChangedWithinTolerance) {
      return fireExitBufferingSentinel()
    }

    return false
  }

  function shouldBeSeekedSentinel() {
    if (sentinelSeekTime === undefined || disableSeekSentinel) {
      return false
    }

    const currentTime = getCurrentTime();
    let sentinelActionTaken = false;

    if (Math.abs(currentTime - sentinelSeekTime) > seekSentinelTolerance) {
      sentinelActionTaken = nextSentinelAttempt(sentinelLimits.seek, () => {
        mediaElement.currentTime = sentinelSeekTime;
      });
    } else if (sentinelIntervalNumber < 3) {
      sentinelSeekTime = currentTime;
    } else {
      sentinelSeekTime = undefined;
    }

    return sentinelActionTaken
  }

  function shouldBePausedSentinel() {
    let sentinelActionTaken = false;

    if (hasSentinelTimeChangedWithinTolerance) {
      sentinelActionTaken = nextSentinelAttempt(sentinelLimits.pause, () => {
        pauseMediaElement();
      });
    }

    return sentinelActionTaken
  }

  function nextSentinelAttempt(sentinelInfo, attemptFn) {
    let currentAttemptCount, maxAttemptCount;

    sentinelInfo.currentAttemptCount += 1;
    currentAttemptCount = sentinelInfo.currentAttemptCount;
    maxAttemptCount = sentinelInfo.maximumAttempts;

    if (currentAttemptCount === maxAttemptCount + 1) {
      emitEvent(sentinelInfo.failureEvent);
    }

    if (currentAttemptCount <= maxAttemptCount) {
      attemptFn();
      emitEvent(sentinelInfo.successEvent);
      return true
    }

    return false
  }

  function endOfMediaSentinel() {
    if (!hasSentinelTimeChangedWithinTolerance && nearEndOfMedia) {
      emitEvent(MediaPlayerBase.EVENT.SENTINEL_COMPLETE);
      onEndOfMedia();
      return true
    }
    return false
  }

  function clearSentinels() {
    clearInterval(sentinelInterval);
  }

  function setSentinels(sentinels) {
    if (disableSentinels) {
      return
    }

    clearSentinels();
    sentinelIntervalNumber = 0;
    lastSentinelTime = getCurrentTime();
    sentinelInterval = setInterval(() => {
      sentinelIntervalNumber += 1;
      const newTime = getCurrentTime();

      hasSentinelTimeChangedWithinTolerance = Math.abs(newTime - lastSentinelTime) > 0.2;
      nearEndOfMedia = getDuration() - (newTime || lastSentinelTime) <= 1;
      lastSentinelTime = newTime;

      for (let i = 0; i < sentinels.length; i++) {
        const sentinelActivated = sentinels[i].call();

        if (getCurrentTime() > 0) {
          trustZeroes = false;
        }

        if (sentinelActivated) {
          break
        }
      }
    }, 1100);
  }

  function reportError(errorString, mediaError) {
    DebugToolInstance.info("HTML5 Media Player error: " + errorString);
    emitEvent(MediaPlayerBase.EVENT.ERROR, mediaError);
  }

  function toBuffering() {
    state = MediaPlayerBase.STATE.BUFFERING;
    emitEvent(MediaPlayerBase.EVENT.BUFFERING);
    setSentinels([exitBufferingSentinel]);
  }

  function toComplete() {
    state = MediaPlayerBase.STATE.COMPLETE;
    emitEvent(MediaPlayerBase.EVENT.COMPLETE);
    setSentinels([]);
  }

  function toEmpty() {
    wipe();
    state = MediaPlayerBase.STATE.EMPTY;
  }

  function toError(errorMessage) {
    wipe();
    state = MediaPlayerBase.STATE.ERROR;
    reportError(errorMessage);
  }

  function isReadyToPlayFrom() {
    if (readyToPlayFrom !== undefined) {
      return readyToPlayFrom
    }
    return false
  }

  function getMediaDuration() {
    if (mediaElement && isReadyToPlayFrom()) {
      return mediaElement.duration
    }

    return undefined
  }

  function getCachedSeekableRange() {
    if (readyToCache) {
      cacheSeekableRange();
    }

    return cachedSeekableRange
  }

  function cacheSeekableRange() {
    readyToCache = false;
    setTimeout(function () {
      readyToCache = true;
    }, 250);

    cachedSeekableRange = getElementSeekableRange();
  }

  function getElementSeekableRange() {
    if (mediaElement) {
      if (isReadyToPlayFrom() && mediaElement.seekable && mediaElement.seekable.length > 0) {
        return {
          start: mediaElement.seekable.start(0),
          end: mediaElement.seekable.end(0),
        }
      } else if (mediaElement.duration !== undefined) {
        return {
          start: 0,
          end: mediaElement.duration,
        }
      }
    }
  }

  function getSeekableRange() {
    if (window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.cacheSeekableRange) {
      return getCachedSeekableRange()
    } else {
      return getElementSeekableRange()
    }
  }

  function onFinishedBuffering() {
    exitBuffering();
  }

  function pauseMediaElement() {
    mediaElement.pause();
    ignoreNextPauseEvent = true;
  }

  function onPause() {
    if (ignoreNextPauseEvent) {
      ignoreNextPauseEvent = false;
      return
    }

    if (getState() !== MediaPlayerBase.STATE.PAUSED) {
      toPaused();
    }
  }

  function onError() {
    reportError("Media element error code: " + mediaElement.error.code, {
      code: mediaElement.error.code,
      message: mediaElement.error.message,
    });
  }

  function onSourceError() {
    reportError("Media source element error");
  }

  function onDeviceBuffering() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      toBuffering();
    }
  }

  function onEndOfMedia() {
    toComplete();
  }

  function emitSeekAttempted() {
    if (getState() === MediaPlayerBase.STATE.EMPTY) {
      emitEvent(MediaPlayerBase.EVENT.SEEK_ATTEMPTED);
      seekFinished = false;
    }

    count = 0;
    timeoutHappened = false;
    if (window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.restartTimeout) {
      setTimeout(() => {
        timeoutHappened = true;
      }, window.bigscreenPlayer.overrides.restartTimeout);
    } else {
      timeoutHappened = true;
    }
  }

  function emitSeekFinishedAtCorrectStartingPoint() {
    let isAtCorrectStartingPoint = Math.abs(getCurrentTime() - sentinelSeekTime) <= seekSentinelTolerance;

    if (sentinelSeekTime === undefined) {
      isAtCorrectStartingPoint = true;
    }

    const isPlayingAtCorrectTime = getState() === MediaPlayerBase.STATE.PLAYING && isAtCorrectStartingPoint;

    if (isPlayingAtCorrectTime && count >= 5 && timeoutHappened && !seekFinished) {
      emitEvent(MediaPlayerBase.EVENT.SEEK_FINISHED);
      seekFinished = true;
    } else if (isPlayingAtCorrectTime) {
      count++;
    } else {
      count = 0;
    }
  }

  function onStatus() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      emitEvent(MediaPlayerBase.EVENT.STATUS);
    }

    emitSeekFinishedAtCorrectStartingPoint();
  }

  function onMetadata() {
    metadataLoaded();
  }

  function exitBuffering() {
    metadataLoaded();

    if (getState() !== MediaPlayerBase.STATE.BUFFERING) {
      return
    } else if (postBufferingState === MediaPlayerBase.STATE.PAUSED) {
      toPaused();
    } else {
      toPlaying();
    }
  }

  function metadataLoaded() {
    readyToPlayFrom = true;

    if (waitingToPlayFrom()) {
      deferredPlayFrom();
    }
  }

  function playFromIfReady() {
    if (isReadyToPlayFrom()) {
      if (waitingToPlayFrom()) {
        deferredPlayFrom();
      }
    }
  }

  function waitingToPlayFrom() {
    return targetSeekTime !== undefined
  }

  function deferredPlayFrom() {
    if (window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.deferredPlayback) {
      handlePlayPromise(mediaElement.play());
      seekTo(targetSeekTime);
    } else {
      seekTo(targetSeekTime);
      handlePlayPromise(mediaElement.play());
    }

    if (postBufferingState === MediaPlayerBase.STATE.PAUSED) {
      pauseMediaElement();
    }
    targetSeekTime = undefined;
  }

  function seekTo(seconds) {
    const clampedTime = getClampedTimeForPlayFrom(seconds);

    mediaElement.currentTime = clampedTime;
    sentinelSeekTime = clampedTime;
  }

  function getCurrentTime() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        return
      default:
        if (mediaElement) {
          return mediaElement.currentTime
        }
    }
  }

  /**
   * Time (in seconds) compared to current time within which seeking has no effect.
   * @constant {Number}
   */
  const CURRENT_TIME_TOLERANCE = 1;

  /**
   * Check whether a time value is near to the current media play time.
   * @param {Number} seconds The time value to test, in seconds from the start of the media
   * @protected
   */
  function isNearToCurrentTime(seconds) {
    const currentTime = getCurrentTime();
    const targetTime = getClampedTime(seconds);

    return Math.abs(currentTime - targetTime) <= CURRENT_TIME_TOLERANCE
  }

  /**
   * Clamp a time value so it does not exceed the current range.
   * Clamps to near the end instead of the end itself to allow for devices that cannot seek to the very end of the media.
   * @param {Number} seconds The time value to clamp in seconds from the start of the media
   * @protected
   */
  function getClampedTime(seconds) {
    const CLAMP_OFFSET_FROM_END_OF_RANGE = 1.1;
    const range = getSeekableRange();
    const nearToEnd = Math.max(range.end - CLAMP_OFFSET_FROM_END_OF_RANGE, range.start);

    if (seconds < range.start) {
      return range.start
    } else if (seconds > nearToEnd) {
      return nearToEnd
    } else {
      return seconds
    }
  }

  function getClampedTimeForPlayFrom(seconds) {
    return getClampedTime(seconds)
  }

  function wipe() {
    mediaType = undefined;
    source = undefined;
    mimeType = undefined;
    targetSeekTime = undefined;
    sentinelSeekTime = undefined;

    clearSentinels();
    destroyMediaElement();

    readyToPlayFrom = false;
  }

  function destroyMediaElement() {
    if (mediaElement) {
      mediaElement.removeEventListener("canplay", onFinishedBuffering, false);
      mediaElement.removeEventListener("seeked", onFinishedBuffering, false);
      mediaElement.removeEventListener("playing", onFinishedBuffering, false);
      mediaElement.removeEventListener("error", onError, false);
      mediaElement.removeEventListener("ended", onEndOfMedia, false);
      mediaElement.removeEventListener("waiting", onDeviceBuffering, false);
      mediaElement.removeEventListener("timeupdate", onStatus, false);
      mediaElement.removeEventListener("loadedmetadata", onMetadata, false);
      mediaElement.removeEventListener("pause", onPause, false);
      sourceElement.removeEventListener("error", onSourceError, false);

      DOMHelpers.safeRemoveElement(sourceElement);
      unloadMediaSrc();
      DOMHelpers.safeRemoveElement(mediaElement);

      mediaElement = null;
      sourceElement = null;
    }
  }

  function unloadMediaSrc() {
    if (window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.disableMediaSourceUnload) {
      return
    }
    // Reset source as advised by HTML5 video spec, section 4.8.10.15:
    // http://www.w3.org/TR/2011/WD-html5-20110405/video.html#best-practices-for-authors-using-media-elements
    mediaElement.removeAttribute("src");
    mediaElement.load();
  }

  function toPaused() {
    state = MediaPlayerBase.STATE.PAUSED;
    emitEvent(MediaPlayerBase.EVENT.PAUSED);
    setSentinels([shouldBeSeekedSentinel, shouldBePausedSentinel]);
  }

  function toPlaying() {
    state = MediaPlayerBase.STATE.PLAYING;
    emitEvent(MediaPlayerBase.EVENT.PLAYING);
    setSentinels([endOfMediaSentinel, shouldBeSeekedSentinel, enterBufferingSentinel]);
  }

  return {
    addEventCallback: (thisArg, newCallback) => {
      eventCallback = (event) => newCallback.call(thisArg, event);
      eventCallbacks.push(eventCallback);
    },

    removeEventCallback: (callback) => {
      const index = eventCallbacks.indexOf(callback);

      if (index !== -1) {
        eventCallbacks.splice(index, 1);
      }
    },

    removeAllEventCallbacks: () => {
      eventCallbacks = [];
    },

    initialiseMedia: (type, url, mediaMimeType, sourceContainer, opts) => {
      opts = opts || {};
      disableSentinels = opts.disableSentinels;
      disableSeekSentinel = opts.disableSeekSentinel;
      mediaType = type;
      source = url;
      mimeType = mediaMimeType;

      emitSeekAttempted();

      if (getState() === MediaPlayerBase.STATE.EMPTY) {
        let idSuffix = "Video";

        if (mediaType === MediaPlayerBase.TYPE.AUDIO || mediaType === MediaPlayerBase.TYPE.LIVE_AUDIO) {
          idSuffix = "Audio";
        }

        setSeekSentinelTolerance();

        mediaElement = document.createElement(idSuffix.toLowerCase(), "mediaPlayer" + idSuffix);
        mediaElement.autoplay = false;
        mediaElement.style.position = "absolute";
        mediaElement.style.top = "0px";
        mediaElement.style.left = "0px";
        mediaElement.style.width = "100%";
        mediaElement.style.height = "100%";

        mediaElement.addEventListener("canplay", onFinishedBuffering, false);
        mediaElement.addEventListener("seeked", onFinishedBuffering, false);
        mediaElement.addEventListener("playing", onFinishedBuffering, false);
        mediaElement.addEventListener("error", onError, false);
        mediaElement.addEventListener("ended", onEndOfMedia, false);
        mediaElement.addEventListener("waiting", onDeviceBuffering, false);
        mediaElement.addEventListener("timeupdate", onStatus, false);
        mediaElement.addEventListener("loadedmetadata", onMetadata, false);
        mediaElement.addEventListener("pause", onPause, false);

        prependChildElement(sourceContainer, mediaElement);

        sourceElement = generateSourceElement(url, mimeType);
        sourceElement.addEventListener("error", onSourceError, false);

        mediaElement.preload = "auto";
        appendChildElement(mediaElement, sourceElement);

        mediaElement.load();

        toStopped();
      } else {
        toError("Cannot set source unless in the '" + MediaPlayerBase.STATE.EMPTY + "' state");
      }
    },

    setPlaybackRate: (rate) => {
      mediaElement.playbackRate = rate;
    },

    getPlaybackRate: () => mediaElement.playbackRate,

    playFrom: (seconds) => {
      postBufferingState = MediaPlayerBase.STATE.PLAYING;
      targetSeekTime = seconds;
      sentinelLimits.seek.currentAttemptCount = 0;

      switch (getState()) {
        case MediaPlayerBase.STATE.PAUSED:
        case MediaPlayerBase.STATE.COMPLETE:
          trustZeroes = true;
          toBuffering();
          playFromIfReady();
          break

        case MediaPlayerBase.STATE.BUFFERING:
          playFromIfReady();
          break

        case MediaPlayerBase.STATE.PLAYING:
          trustZeroes = true;
          toBuffering();
          targetSeekTime = getClampedTimeForPlayFrom(seconds);
          if (isNearToCurrentTime(targetSeekTime)) {
            targetSeekTime = undefined;
            toPlaying();
          } else {
            playFromIfReady();
          }
          break

        default:
          toError("Cannot playFrom while in the '" + getState() + "' state");
          break
      }
    },

    beginPlayback: () => {
      postBufferingState = MediaPlayerBase.STATE.PLAYING;
      sentinelSeekTime = undefined;

      switch (getState()) {
        case MediaPlayerBase.STATE.STOPPED:
          trustZeroes = true;
          toBuffering();
          handlePlayPromise(mediaElement.play());
          break

        default:
          toError("Cannot beginPlayback while in the '" + getState() + "' state");
          break
      }
    },

    beginPlaybackFrom: (seconds) => {
      postBufferingState = MediaPlayerBase.STATE.PLAYING;
      targetSeekTime = seconds;
      sentinelLimits.seek.currentAttemptCount = 0;

      switch (getState()) {
        case MediaPlayerBase.STATE.STOPPED:
          trustZeroes = true;
          toBuffering();
          playFromIfReady();
          break

        default:
          toError("Cannot beginPlaybackFrom while in the '" + getState() + "' state");
          break
      }
    },

    pause: () => {
      postBufferingState = MediaPlayerBase.STATE.PAUSED;
      switch (getState()) {
        case MediaPlayerBase.STATE.PAUSED:
          break

        case MediaPlayerBase.STATE.BUFFERING:
          sentinelLimits.pause.currentAttemptCount = 0;
          if (isReadyToPlayFrom()) {
            // If we are not ready to playFrom, then calling pause would seek to the start of media, which we might not want.
            pauseMediaElement();
          }
          break

        case MediaPlayerBase.STATE.PLAYING:
          sentinelLimits.pause.currentAttemptCount = 0;
          pauseMediaElement();
          toPaused();
          break

        default:
          toError("Cannot pause while in the '" + getState() + "' state");
          break
      }
    },

    resume: () => {
      postBufferingState = MediaPlayerBase.STATE.PLAYING;
      switch (getState()) {
        case MediaPlayerBase.STATE.PLAYING:
          break

        case MediaPlayerBase.STATE.BUFFERING:
          if (isReadyToPlayFrom()) {
            // If we are not ready to playFrom, then calling play would seek to the start of media, which we might not want.
            handlePlayPromise(mediaElement.play());
          }
          break

        case MediaPlayerBase.STATE.PAUSED:
          handlePlayPromise(mediaElement.play());
          toPlaying();
          break

        default:
          toError("Cannot resume while in the '" + getState() + "' state");
          break
      }
    },

    stop: () => {
      switch (getState()) {
        case MediaPlayerBase.STATE.STOPPED:
          break

        case MediaPlayerBase.STATE.BUFFERING:
        case MediaPlayerBase.STATE.PLAYING:
        case MediaPlayerBase.STATE.PAUSED:
        case MediaPlayerBase.STATE.COMPLETE:
          pauseMediaElement();
          toStopped();
          break

        default:
          toError("Cannot stop while in the '" + getState() + "' state");
          break
      }
    },

    reset: () => {
      switch (getState()) {
        case MediaPlayerBase.STATE.EMPTY:
          break

        case MediaPlayerBase.STATE.STOPPED:
        case MediaPlayerBase.STATE.ERROR:
          toEmpty();
          break

        default:
          toError("Cannot reset while in the '" + getState() + "' state");
          break
      }
    },

    getSeekableRange: () => {
      switch (getState()) {
        case MediaPlayerBase.STATE.STOPPED:
        case MediaPlayerBase.STATE.ERROR:
          break

        default:
          return getSeekableRange()
      }
      return undefined
    },

    getState: () => state,
    getPlayerElement: () => mediaElement,
    getSource: getSource,
    getMimeType: getMimeType,
    getCurrentTime: getCurrentTime,
    getDuration: getDuration,
    toPaused: toPaused,
    toPlaying: toPlaying,
  }
}

function SamsungMaple() {
  const playerPlugin = document.getElementById("playerPlugin");

  let state = MediaPlayerBase.STATE.EMPTY;
  let deferSeekingTo = null;
  let postBufferingState = null;
  let tryingToPause = false;
  let currentTimeKnown = false;

  let mediaType;
  let source;
  let mimeType;

  let range;
  let currentTime;

  let eventCallbacks = [];
  let eventCallback;

  function initialiseMedia(type, url, mediaMimeType) {
    if (getState() === MediaPlayerBase.STATE.EMPTY) {
      mediaType = type;
      source = url;
      mimeType = mediaMimeType;
      _registerEventHandlers();
      _toStopped();
    } else {
      _toError("Cannot set source unless in the '" + MediaPlayerBase.STATE.EMPTY + "' state");
    }
  }

  function resume() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.PLAYING:
        break

      case MediaPlayerBase.STATE.BUFFERING:
        if (tryingToPause) {
          tryingToPause = false;
          toPlaying();
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        playerPlugin.Resume();
        toPlaying();
        break

      default:
        _toError("Cannot resume while in the '" + getState() + "' state");
        break
    }
  }

  function playFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;

    const seekingTo = range ? _getClampedTimeForPlayFrom(seconds) : seconds;

    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
        deferSeekingTo = seekingTo;
        break

      case MediaPlayerBase.STATE.PLAYING:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          playerPlugin.Resume();
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
          playerPlugin.Resume();
        }
        break

      case MediaPlayerBase.STATE.COMPLETE:
        playerPlugin.Stop();
        _setDisplayFullScreenForVideo();
        playerPlugin.ResumePlay(_wrappedSource(), seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot playFrom while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlayback() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        _toBuffering();
        _setDisplayFullScreenForVideo();
        playerPlugin.Play(_wrappedSource());
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlaybackFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;

    const seekingTo = range ? _getClampedTimeForPlayFrom(seconds) : seconds;

    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        _setDisplayFullScreenForVideo();
        playerPlugin.ResumePlay(_wrappedSource(), seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function pause() {
    postBufferingState = MediaPlayerBase.STATE.PAUSED;
    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PAUSED:
        break

      case MediaPlayerBase.STATE.PLAYING:
        _tryPauseWithStateTransition();
        break

      default:
        _toError("Cannot pause while in the '" + getState() + "' state");
        break
    }
  }

  function stop() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        break

      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PLAYING:
      case MediaPlayerBase.STATE.PAUSED:
      case MediaPlayerBase.STATE.COMPLETE:
        _stopPlayer();
        _toStopped();
        break

      default:
        _toError("Cannot stop while in the '" + getState() + "' state");
        break
    }
  }

  function reset() {
    switch (getState()) {
      case MediaPlayerBase.STATE.EMPTY:
        break

      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        _toEmpty();
        break

      default:
        _toError("Cannot reset while in the '" + getState() + "' state");
        break
    }
  }

  function getSource() {
    return source
  }

  function getMimeType() {
    return mimeType
  }

  function getCurrentTime() {
    if (getState() === MediaPlayerBase.STATE.STOPPED) {
      return undefined
    } else {
      return currentTime
    }
  }

  function getSeekableRange() {
    return range
  }

  function getDuration() {
    if (range) {
      return range.end
    }
    return undefined
  }

  function getState() {
    return state
  }

  function getPlayerElement() {
    return playerPlugin
  }

  function toPlaying() {
    state = MediaPlayerBase.STATE.PLAYING;
    _emitEvent(MediaPlayerBase.EVENT.PLAYING);
  }

  function toPaused() {
    state = MediaPlayerBase.STATE.PAUSED;
    _emitEvent(MediaPlayerBase.EVENT.PAUSED);
  }

  function _toStopped() {
    currentTime = 0;
    range = undefined;
    state = MediaPlayerBase.STATE.STOPPED;
    _emitEvent(MediaPlayerBase.EVENT.STOPPED);
  }

  function _toBuffering() {
    state = MediaPlayerBase.STATE.BUFFERING;
    _emitEvent(MediaPlayerBase.EVENT.BUFFERING);
  }

  function _toComplete() {
    state = MediaPlayerBase.STATE.COMPLETE;
    _emitEvent(MediaPlayerBase.EVENT.COMPLETE);
  }

  function _toEmpty() {
    _wipe();
    state = MediaPlayerBase.STATE.EMPTY;
  }

  function _toError(errorMessage) {
    _wipe();
    state = MediaPlayerBase.STATE.ERROR;
    _reportError(errorMessage);
    throw new Error("ApiError: " + errorMessage)
  }

  function _onFinishedBuffering() {
    if (getState() !== MediaPlayerBase.STATE.BUFFERING) {
      return
    }

    if (deferSeekingTo === null) {
      if (postBufferingState === MediaPlayerBase.STATE.PAUSED) {
        _tryPauseWithStateTransition();
      } else {
        toPlaying();
      }
    }
  }

  function _onDeviceError(message) {
    _reportError(message);
  }

  function _onDeviceBuffering() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      _toBuffering();
    }
  }

  function _onEndOfMedia() {
    _toComplete();
  }

  function _stopPlayer() {
    playerPlugin.Stop();
    currentTimeKnown = false;
  }

  function _tryPauseWithStateTransition() {
    let success = _isSuccessCode(playerPlugin.Pause());
    if (success) {
      toPaused();
    }

    tryingToPause = !success;
  }

  function _onStatus() {
    let state = getState();
    if (state === MediaPlayerBase.STATE.PLAYING) {
      _emitEvent(MediaPlayerBase.EVENT.STATUS);
    }
  }

  function _onMetadata() {
    range = {
      start: 0,
      end: playerPlugin.GetDuration() / 1000,
    };
  }

  function _onCurrentTime(timeInMillis) {
    currentTime = timeInMillis / 1000;
    _onStatus();
    currentTimeKnown = true;

    if (deferSeekingTo !== null) {
      _deferredSeek();
    }

    if (tryingToPause) {
      _tryPauseWithStateTransition();
    }
  }

  function _deferredSeek() {
    const clampedTime = _getClampedTimeForPlayFrom(deferSeekingTo);
    const isNearCurrentTime = _isNearToCurrentTime(clampedTime);

    if (isNearCurrentTime) {
      toPlaying();
      deferSeekingTo = null;
    } else {
      const seekResult = _seekTo(clampedTime);

      if (seekResult) {
        deferSeekingTo = null;
      }
    }
  }

  function _getClampedTimeForPlayFrom(seconds) {
    const clampedTime = getClampedTime(seconds);

    if (clampedTime !== seconds) {
      DebugToolInstance.info(
        "playFrom " +
          seconds +
          " clamped to " +
          clampedTime +
          " - seekable range is { start: " +
          range.start +
          ", end: " +
          range.end +
          " }"
      );
    }
    return clampedTime
  }

  function _onWindowHide() {
    stop();
  }

  function _registerEventHandlers() {
    window.SamsungMapleOnRenderError = () => _onDeviceError("Media element emitted OnRenderError");
    playerPlugin.OnRenderError = "SamsungMapleOnRenderError";

    window.SamsungMapleOnConnectionFailed = () => _onDeviceError("Media element emitted OnConnectionFailed");
    playerPlugin.OnConnectionFailed = "SamsungMapleOnConnectionFailed";

    window.SamsungMapleOnNetworkDisconnected = () => _onDeviceError("Media element emitted OnNetworkDisconnected");
    playerPlugin.OnNetworkDisconnected = "SamsungMapleOnNetworkDisconnected";

    window.SamsungMapleOnStreamNotFound = () => _onDeviceError("Media element emitted OnStreamNotFound");
    playerPlugin.OnStreamNotFound = "SamsungMapleOnStreamNotFound";

    window.SamsungMapleOnAuthenticationFailed = () => _onDeviceError("Media element emitted OnAuthenticationFailed");
    playerPlugin.OnAuthenticationFailed = "SamsungMapleOnAuthenticationFailed";

    window.SamsungMapleOnRenderingComplete = () => _onEndOfMedia();
    playerPlugin.OnRenderingComplete = "SamsungMapleOnRenderingComplete";

    window.SamsungMapleOnBufferingStart = () => _onDeviceBuffering();
    playerPlugin.OnBufferingStart = "SamsungMapleOnBufferingStart";

    window.SamsungMapleOnBufferingComplete = () => _onFinishedBuffering();
    playerPlugin.OnBufferingComplete = "SamsungMapleOnBufferingComplete";

    window.SamsungMapleOnStreamInfoReady = () => _onMetadata();
    playerPlugin.OnStreamInfoReady = "SamsungMapleOnStreamInfoReady";

    window.SamsungMapleOnCurrentPlayTime = (timeInMillis) => _onCurrentTime(timeInMillis);
    playerPlugin.OnCurrentPlayTime = "SamsungMapleOnCurrentPlayTime";

    window.addEventListener("hide", _onWindowHide, false);
    window.addEventListener("unload", _onWindowHide, false);
  }

  function _unregisterEventHandlers() {
    const eventHandlers = [
      "SamsungMapleOnRenderError",
      "SamsungMapleOnRenderingComplete",
      "SamsungMapleOnBufferingStart",
      "SamsungMapleOnBufferingComplete",
      "SamsungMapleOnStreamInfoReady",
      "SamsungMapleOnCurrentPlayTime",
      "SamsungMapleOnConnectionFailed",
      "SamsungMapleOnNetworkDisconnected",
      "SamsungMapleOnStreamNotFound",
      "SamsungMapleOnAuthenticationFailed",
    ];

    for (let i = 0; i < eventHandlers.length; i++) {
      const handler = eventHandlers[i];
      const hook = handler.substring("SamsungMaple".length);

      playerPlugin[hook] = undefined;
      delete window[handler];
    }

    window.removeEventListener("hide", _onWindowHide, false);
    window.removeEventListener("unload", _onWindowHide, false);
  }

  function _wipe() {
    _stopPlayer();
    mediaType = undefined;
    source = undefined;
    mimeType = undefined;
    currentTime = undefined;
    range = undefined;
    deferSeekingTo = null;
    tryingToPause = false;
    currentTimeKnown = false;
    _unregisterEventHandlers();
  }

  function _seekTo(seconds) {
    const offset = seconds - getCurrentTime();
    const success = _isSuccessCode(_jump(offset));

    if (success) {
      currentTime = seconds;
    }

    return success
  }

  function _seekToWithFailureStateTransition(seconds) {
    const success = _seekTo(seconds);

    if (!success) {
      toPlaying();
    }
  }

  function _jump(offsetSeconds) {
    if (offsetSeconds > 0) {
      return playerPlugin.JumpForward(offsetSeconds)
    } else {
      return playerPlugin.JumpBackward(Math.abs(offsetSeconds))
    }
  }

  function _isHlsMimeType() {
    const mime = mimeType.toLowerCase();
    return mime === "application/vnd.apple.mpegurl" || mime === "application/x-mpegurl"
  }

  function _wrappedSource() {
    let wrappedSource = source;

    if (_isHlsMimeType()) {
      wrappedSource += "|COMPONENT=HLS";
    }

    return wrappedSource
  }

  function _reportError(errorMessage) {
    DebugToolInstance.info(errorMessage);
    _emitEvent(MediaPlayerBase.EVENT.ERROR, { errorMessage: errorMessage });
  }

  function _setDisplayFullScreenForVideo() {
    if (mediaType === MediaPlayerBase.TYPE.VIDEO) {
      const dimensions = _getScreenSize();
      playerPlugin.SetDisplayArea(0, 0, dimensions.width, dimensions.height);
    }
  }

  function _getScreenSize() {
    let w, h;

    if (typeof window.innerWidth === "number") {
      w = window.innerWidth;
      h = window.innerHeight;
    } else {
      const d = document.documentElement || document.body;

      h = d.clientHeight || d.offsetHeight;
      w = d.clientWidth || d.offsetWidth;
    }

    return {
      width: w,
      height: h,
    }
  }

  function _isSuccessCode(code) {
    const samsung2010ErrorCode = -1;
    return code && code !== samsung2010ErrorCode
  }

  /**
   * @constant {Number} Time (in seconds) compared to current time within which seeking has no effect.
   * On a sample device (Samsung FoxP 2013), seeking by two seconds worked 90% of the time, but seeking
   * by 2.5 seconds was always seen to work.
   */
  const CURRENT_TIME_TOLERANCE = 2.5;

  function _isNearToCurrentTime(seconds) {
    const currentTime = getCurrentTime();
    const targetTime = getClampedTime(seconds);

    return Math.abs(currentTime - targetTime) <= CURRENT_TIME_TOLERANCE
  }

  function getClampedTime(seconds) {
    const range = getSeekableRange();
    const CLAMP_OFFSET_FROM_END_OF_RANGE = 1.1;
    const nearToEnd = Math.max(range.end - CLAMP_OFFSET_FROM_END_OF_RANGE, range.start);

    if (seconds < range.start) {
      return range.start
    } else if (seconds > nearToEnd) {
      return nearToEnd
    } else {
      return seconds
    }
  }

  function _emitEvent(eventType, eventLabels) {
    const event = {
      type: eventType,
      currentTime: getCurrentTime(),
      seekableRange: getSeekableRange(),
      duration: getDuration(),
      url: getSource(),
      mimeType: getMimeType(),
      state: getState(),
    };

    if (eventLabels) {
      for (const key in eventLabels) {
        if (eventLabels.hasOwnProperty(key)) {
          event[key] = eventLabels[key];
        }
      }
    }

    for (let index = 0; index < eventCallbacks.length; index++) {
      eventCallbacks[index](event);
    }
  }

  return {
    addEventCallback: (thisArg, newCallback) => {
      eventCallback = (event) => {
        newCallback.call(thisArg, event);
      };

      eventCallbacks.push(eventCallback);
    },

    removeEventCallback: (callback) => {
      const index = eventCallbacks.indexOf(callback);

      if (index !== -1) {
        eventCallbacks.splice(index, 1);
      }
    },

    removeAllEventCallbacks: () => {
      eventCallbacks = [];
    },
    initialiseMedia: initialiseMedia,
    playFrom: playFrom,
    beginPlayback: beginPlayback,
    beginPlaybackFrom: beginPlaybackFrom,
    resume: resume,
    pause: pause,
    stop: stop,
    reset: reset,
    getSeekableRange: getSeekableRange,
    getState: getState,
    getPlayerElement: getPlayerElement,
    getSource: getSource,
    getMimeType: getMimeType,
    getCurrentTime: getCurrentTime,
    getDuration: getDuration,
    toPaused: toPaused,
    toPlaying: toPlaying,
  }
}

/**
 * @preserve Copyright (c) 2017-present British Broadcasting Corporation. All rights reserved.
 * @license See https://github.com/fmtvp/tal/blob/master/LICENSE for full licence
 */

function SamsungStreaming() {
  let state = MediaPlayerBase.STATE.EMPTY;
  let currentPlayer;
  let deferSeekingTo = null;
  let nextSeekingTo = null;
  let postBufferingState = null;
  let tryingToPause = false;
  let currentTimeKnown = false;
  let updatingTime = false;
  let lastWindowRanged = false;

  let mediaType;
  let source;
  let mimeType;

  let range;
  let currentTime;

  let eventCallbacks = [];
  let eventCallback;

  let playerPlugin;
  let tvmwPlugin;
  let originalSource;

  try {
    _registerSamsungPlugins();
  } catch (ignoreErr) {}

  const PlayerEventCodes = {
    CONNECTION_FAILED: 1,
    AUTHENTICATION_FAILED: 2,
    STREAM_NOT_FOUND: 3,
    NETWORK_DISCONNECTED: 4,
    NETWORK_SLOW: 5,
    RENDER_ERROR: 6,
    RENDERING_START: 7,
    RENDERING_COMPLETE: 8,
    STREAM_INFO_READY: 9,
    DECODING_COMPLETE: 10,
    BUFFERING_START: 11,
    BUFFERING_COMPLETE: 12,
    BUFFERING_PROGRESS: 13,
    CURRENT_PLAYBACK_TIME: 14,
    AD_START: 15,
    AD_END: 16,
    RESOLUTION_CHANGED: 17,
    BITRATE_CHANGED: 18,
    SUBTITLE: 19,
    CUSTOM: 20,
  };

  const PlayerEmps = {
    Player: 0,
    StreamingPlayer: 1,
  };

  /**
   * @constant {Number} Time (in seconds) compared to current time within which seeking has no effect.
   * Jumping to time lower than 3s causes error in PlayFrom60 on HLS live - player jumps to previous chunk.
   * Value set to 4s to be ahead of potential wrong player jumps.
   */
  const CURRENT_TIME_TOLERANCE = 4;
  const CLAMP_OFFSET_FROM_END_OF_LIVE_RANGE = 10;
  const CLAMP_OFFSET_FROM_START_OF_RANGE = 1.1;
  const CLAMP_OFFSET_FROM_END_OF_RANGE = 1.1;
  const RANGE_UPDATE_TOLERANCE = 8;
  const RANGE_END_TOLERANCE = 100;

  function initialiseMedia(type, url, mediaMimeType) {
    if (getState() === MediaPlayerBase.STATE.EMPTY) {
      mediaType = type;
      source = url;
      mimeType = mediaMimeType;
      _registerEventHandlers();
      _toStopped();

      if (_isHlsMimeType()) {
        _openStreamingPlayerPlugin();
        if (_isLiveMedia()) {
          source += "|HLSSLIDING|COMPONENT=HLS";
        } else {
          source += "|COMPONENT=HLS";
        }
      } else {
        _openPlayerPlugin();
      }

      _initPlayer(source);
    } else {
      _toError("Cannot set source unless in the '" + MediaPlayerBase.STATE.EMPTY + "' state");
    }
  }

  function resume() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.PLAYING:
        break

      case MediaPlayerBase.STATE.BUFFERING:
        if (tryingToPause) {
          tryingToPause = false;
          toPlaying();
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        playerPlugin.Execute("Resume");
        toPlaying();
        break

      default:
        _toError("Cannot resume while in the '" + getState() + "' state");
        break
    }
  }

  function playFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    const seekingTo = range ? _getClampedTimeForPlayFrom(seconds) : seconds;

    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
        // deferSeekingTo = seekingTo;
        nextSeekingTo = seekingTo;
        break

      case MediaPlayerBase.STATE.PLAYING:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          playerPlugin.Execute("Resume");
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
          playerPlugin.Execute("Resume");
        }
        break

      case MediaPlayerBase.STATE.COMPLETE:
        playerPlugin.Execute("Stop");
        _initPlayer(source);
        playerPlugin.Execute("StartPlayback", seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot playFrom while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlayback() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        _toBuffering();
        playerPlugin.Execute("StartPlayback");
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlaybackFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    let seekingTo = getSeekableRange() ? _getClampedTimeForPlayFrom(seconds) : seconds;

    // StartPlayback from near start of range causes spoiler defect
    if (seekingTo < CLAMP_OFFSET_FROM_START_OF_RANGE && _isLiveMedia()) {
      seekingTo = CLAMP_OFFSET_FROM_START_OF_RANGE;
    } else {
      seekingTo = parseInt(Math.floor(seekingTo), 10);
    }

    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        playerPlugin.Execute("StartPlayback", seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function pause() {
    postBufferingState = MediaPlayerBase.STATE.PAUSED;
    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PAUSED:
        break

      case MediaPlayerBase.STATE.PLAYING:
        _tryPauseWithStateTransition();
        break

      default:
        _toError("Cannot pause while in the '" + getState() + "' state");
        break
    }
  }

  function stop() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        break

      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PLAYING:
      case MediaPlayerBase.STATE.PAUSED:
      case MediaPlayerBase.STATE.COMPLETE:
        _stopPlayer();
        _toStopped();
        break

      default:
        _toError("Cannot stop while in the '" + getState() + "' state");
        break
    }
  }

  function reset() {
    switch (getState()) {
      case MediaPlayerBase.STATE.EMPTY:
        break

      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        _toEmpty();
        break

      default:
        _toError("Cannot reset while in the '" + getState() + "' state");
        break
    }
  }

  function getSource() {
    return source
  }

  function getMimeType() {
    return mimeType
  }

  function getCurrentTime() {
    if (getState() === MediaPlayerBase.STATE.STOPPED) {
      return undefined
    } else {
      return currentTime
    }
  }

  function getSeekableRange() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        return undefined

      default:
        return range
    }
  }

  function getDuration() {
    if (range) {
      return range.end
    }

    return undefined
  }

  function getState() {
    return state
  }

  function getPlayerElement() {
    return playerPlugin
  }

  function toPlaying() {
    if (_isHlsMimeType() && _isLiveMedia() && !updatingTime) {
      _updateRange();
    }

    state = MediaPlayerBase.STATE.PLAYING;
    _emitEvent(MediaPlayerBase.EVENT.PLAYING);
  }

  function toPaused() {
    state = MediaPlayerBase.STATE.PAUSED;
    _emitEvent(MediaPlayerBase.EVENT.PAUSED);
  }

  function _toStopped() {
    currentTime = 0;
    range = undefined;
    state = MediaPlayerBase.STATE.STOPPED;
    _emitEvent(MediaPlayerBase.EVENT.STOPPED);
  }

  function _toBuffering() {
    state = MediaPlayerBase.STATE.BUFFERING;
    _emitEvent(MediaPlayerBase.EVENT.BUFFERING);
  }

  function _toComplete() {
    state = MediaPlayerBase.STATE.COMPLETE;
    _emitEvent(MediaPlayerBase.EVENT.COMPLETE);
  }

  function _toEmpty() {
    _wipe();
    state = MediaPlayerBase.STATE.EMPTY;
  }

  function _toError(errorMessage) {
    _wipe();
    state = MediaPlayerBase.STATE.ERROR;
    _reportError(errorMessage);
    throw new Error("ApiError: " + errorMessage)
  }

  function _registerSamsungPlugins() {
    playerPlugin = document.getElementById("sefPlayer");
    tvmwPlugin = document.getElementById("pluginObjectTVMW");
    originalSource = tvmwPlugin.GetSource();
    window.addEventListener(
      "hide",
      () => {
        stop();
        tvmwPlugin.SetSource(originalSource);
      },
      false
    );
  }

  function _getClampedTime(seconds) {
    const range = getSeekableRange();
    const offsetFromEnd = _getClampOffsetFromConfig();
    const nearToEnd = Math.max(range.end - offsetFromEnd, range.start);

    if (seconds < range.start) {
      return range.start
    } else if (seconds > nearToEnd) {
      return nearToEnd
    } else {
      return seconds
    }
  }

  function _openPlayerPlugin() {
    if (currentPlayer !== undefined) {
      playerPlugin.Close();
    }

    playerPlugin.Open("Player", "1.010", "Player");
    currentPlayer = PlayerEmps.Player;
  }

  function _isLiveRangeOutdated() {
    const time = Math.floor(currentTime);

    if (time % 8 === 0 && !updatingTime && lastWindowRanged !== time) {
      lastWindowRanged = time;
      return true
    } else {
      return false
    }
  }

  function _openStreamingPlayerPlugin() {
    if (currentPlayer !== undefined) {
      playerPlugin.Close();
    }

    playerPlugin.Open("StreamingPlayer", "1.0", "StreamingPlayer");
    currentPlayer = PlayerEmps.StreamingPlayer;
  }

  function _closePlugin() {
    playerPlugin.Close();
    currentPlayer = undefined;
  }

  function _initPlayer(source) {
    const result = playerPlugin.Execute("InitPlayer", source);

    if (result !== 1) {
      _toError("Failed to initialize video: " + source);
    }
  }

  function _onFinishedBuffering() {
    if (getState() !== MediaPlayerBase.STATE.BUFFERING) {
      return
    }

    if (!_isInitialBufferingFinished() && nextSeekingTo !== null) {
      deferSeekingTo = nextSeekingTo;
      nextSeekingTo = null;
    }

    if (deferSeekingTo === null) {
      if (postBufferingState === MediaPlayerBase.STATE.PAUSED) {
        _tryPauseWithStateTransition();
      } else {
        toPlaying();
      }
    }
  }

  function _onDeviceError(message) {
    _reportError(message);
  }

  function _onDeviceBuffering() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      _toBuffering();
    }
  }

  function _onEndOfMedia() {
    _toComplete();
  }

  function _stopPlayer() {
    playerPlugin.Execute("Stop");
    currentTimeKnown = false;
  }

  function _tryPauseWithStateTransition() {
    let success = playerPlugin.Execute("Pause");
    success = success && success !== -1;

    if (success) {
      toPaused();
    }

    tryingToPause = !success;
  }

  function _onStatus() {
    const state = getState();

    if (state === MediaPlayerBase.STATE.PLAYING) {
      _emitEvent(MediaPlayerBase.EVENT.STATUS);
    }
  }

  function _updateRange() {
    if (_isHlsMimeType() && _isLiveMedia()) {
      const playingRange = playerPlugin.Execute("GetPlayingRange").split("-");

      range = {
        start: Math.floor(playingRange[0]),
        end: Math.floor(playingRange[1]),
      };

      // don't call range for the next 8 seconds
      updatingTime = true;
      setTimeout(() => {
        updatingTime = false;
      }, RANGE_UPDATE_TOLERANCE * 1000);
    } else {
      const duration = playerPlugin.Execute("GetDuration") / 1000;
      range = {
        start: 0,
        end: duration,
      };
    }
  }

  function _onCurrentTime(timeInMillis) {
    currentTime = timeInMillis / 1000;
    _onStatus();
    currentTimeKnown = true;

    // [optimisation] do not call player API periodically in HLS live
    // - calculate range manually when possible
    // - do not calculate range if player API was called less than RANGE_UPDATE_TOLERANCE seconds ago
    if (_isLiveMedia() && _isLiveRangeOutdated()) {
      range.start += 8;
      range.end += 8;
    }

    if (nextSeekingTo !== null) {
      deferSeekingTo = nextSeekingTo;
      nextSeekingTo = null;
    }

    if (deferSeekingTo !== null) {
      _deferredSeek();
    }

    if (tryingToPause) {
      _tryPauseWithStateTransition();
    }
  }

  function _deferredSeek() {
    const clampedTime = _getClampedTimeForPlayFrom(deferSeekingTo);
    const isNearCurrentTime = _isNearToCurrentTime(clampedTime);

    if (isNearCurrentTime) {
      toPlaying();
      deferSeekingTo = null;
    } else {
      const seekResult = _seekTo(clampedTime);

      if (seekResult) {
        deferSeekingTo = null;
      }
    }
  }

  function _getClampedTimeForPlayFrom(seconds) {
    if (currentPlayer === PlayerEmps.StreamingPlayer && !updatingTime) {
      _updateRange();
    }

    const clampedTime = _getClampedTime(seconds);

    if (clampedTime !== seconds) {
      DebugToolInstance.info(
        "playFrom " +
          seconds +
          " clamped to " +
          clampedTime +
          " - seekable range is { start: " +
          range.start +
          ", end: " +
          range.end +
          " }"
      );
    }

    return clampedTime
  }

  function _getClampOffsetFromConfig() {
    if (_isLiveMedia()) {
      return CLAMP_OFFSET_FROM_END_OF_LIVE_RANGE
    } else {
      return CLAMP_OFFSET_FROM_END_OF_RANGE
    }
  }

  function _registerEventHandlers() {
    playerPlugin.OnEvent = (eventType, param1) => {
      switch (eventType) {
        case PlayerEventCodes.STREAM_INFO_READY:
          _updateRange();
          break

        case PlayerEventCodes.CURRENT_PLAYBACK_TIME:
          if (range && _isLiveMedia()) {
            const seconds = Math.floor(param1 / 1000);

            // jump to previous current time if PTS out of range occurs
            if (seconds > range.end + RANGE_END_TOLERANCE) {
              playFrom(currentTime);
              break
              // call GetPlayingRange() on SEF emp if current time is out of range
            } else if (!_isCurrentTimeInRangeTolerance(seconds)) {
              _updateRange();
            }
          }

          _onCurrentTime(param1);
          break

        case PlayerEventCodes.BUFFERING_START:
        case PlayerEventCodes.BUFFERING_PROGRESS:
          _onDeviceBuffering();
          break

        case PlayerEventCodes.BUFFERING_COMPLETE:
          // For live HLS, don't update the range more than once every 8 seconds
          if (!updatingTime) {
            _updateRange();
          }

          // [optimisation] if Stop() is not called after RENDERING_COMPLETE then player sends periodically BUFFERING_COMPLETE and RENDERING_COMPLETE
          // ignore BUFFERING_COMPLETE if player is already in COMPLETE state
          if (getState() !== MediaPlayerBase.STATE.COMPLETE) {
            _onFinishedBuffering();
          }
          break

        case PlayerEventCodes.RENDERING_COMPLETE:
          // [optimisation] if Stop() is not called after RENDERING_COMPLETE then player sends periodically BUFFERING_COMPLETE and RENDERING_COMPLETE
          // ignore RENDERING_COMPLETE if player is already in COMPLETE state
          if (getState() !== MediaPlayerBase.STATE.COMPLETE) {
            _onEndOfMedia();
          }
          break

        case PlayerEventCodes.CONNECTION_FAILED:
          _onDeviceError("Media element emitted OnConnectionFailed");
          break

        case PlayerEventCodes.NETWORK_DISCONNECTED:
          _onDeviceError("Media element emitted OnNetworkDisconnected");
          break

        case PlayerEventCodes.AUTHENTICATION_FAILED:
          _onDeviceError("Media element emitted OnAuthenticationFailed");
          break

        case PlayerEventCodes.RENDER_ERROR:
          _onDeviceError("Media element emitted OnRenderError");
          break

        case PlayerEventCodes.STREAM_NOT_FOUND:
          _onDeviceError("Media element emitted OnStreamNotFound");
          break
      }
    };

    window.addEventListener("hide", _onWindowHide, false);
    window.addEventListener("unload", _onWindowHide, false);
  }

  function _onWindowHide() {
    stop();
  }

  function _unregisterEventHandlers() {
    playerPlugin.OnEvent = undefined;
    window.removeEventListener("hide", _onWindowHide, false);
    window.removeEventListener("unload", _onWindowHide, false);
  }

  function _wipe() {
    _stopPlayer();
    _closePlugin();
    _unregisterEventHandlers();

    mediaType = undefined;
    source = undefined;
    mimeType = undefined;
    currentTime = undefined;
    range = undefined;
    deferSeekingTo = null;
    nextSeekingTo = null;
    tryingToPause = false;
    currentTimeKnown = false;
    updatingTime = false;
    lastWindowRanged = false;
  }

  function _seekTo(seconds) {
    const offset = seconds - getCurrentTime();
    const success = _jump(offset);

    if (success === 1) {
      currentTime = seconds;
    }

    return success
  }

  function _seekToWithFailureStateTransition(seconds) {
    const success = _seekTo(seconds);

    if (success !== 1) {
      toPlaying();
    }
  }

  function _jump(offsetSeconds) {
    let result;

    if (offsetSeconds > 0) {
      result = playerPlugin.Execute("JumpForward", offsetSeconds);
      return result
    } else {
      result = playerPlugin.Execute("JumpBackward", Math.abs(offsetSeconds));
      return result
    }
  }

  function _isHlsMimeType() {
    const mime = mimeType.toLowerCase();
    return mime === "application/vnd.apple.mpegurl" || mime === "application/x-mpegurl"
  }

  function _isCurrentTimeInRangeTolerance(seconds) {
    if (seconds > range.end + RANGE_UPDATE_TOLERANCE) {
      return false
    } else if (seconds < range.start - RANGE_UPDATE_TOLERANCE) {
      return false
    } else {
      return true
    }
  }

  function _isInitialBufferingFinished() {
    if (currentTime === undefined || currentTime === 0) {
      return false
    } else {
      return true
    }
  }

  function _reportError(errorMessage) {
    DebugToolInstance.info(errorMessage);
    _emitEvent(MediaPlayerBase.EVENT.ERROR, { errorMessage: errorMessage });
  }

  function _isNearToCurrentTime(seconds) {
    const currentTime = getCurrentTime();
    const targetTime = _getClampedTime(seconds);

    return Math.abs(currentTime - targetTime) <= CURRENT_TIME_TOLERANCE
  }

  function _isLiveMedia() {
    return mediaType === MediaPlayerBase.TYPE.LIVE_VIDEO || mediaType === MediaPlayerBase.TYPE.LIVE_AUDIO
  }

  function _emitEvent(eventType, eventLabels) {
    const event = {
      type: eventType,
      currentTime: getCurrentTime(),
      seekableRange: getSeekableRange(),
      duration: getDuration(),
      url: getSource(),
      mimeType: getMimeType(),
      state: getState(),
    };

    if (eventLabels) {
      for (const key in eventLabels) {
        if (eventLabels.hasOwnProperty(key)) {
          event[key] = eventLabels[key];
        }
      }
    }

    for (let index = 0; index < eventCallbacks.length; index++) {
      eventCallbacks[index](event);
    }
  }

  return {
    addEventCallback: (thisArg, newCallback) => {
      eventCallback = (event) => newCallback.call(thisArg, event);
      eventCallbacks.push(eventCallback);
    },

    removeEventCallback: (callback) => {
      const index = eventCallbacks.indexOf(callback);

      if (index !== -1) {
        eventCallbacks.splice(index, 1);
      }
    },

    removeAllEventCallbacks: () => {
      eventCallbacks = [];
    },

    initialiseMedia: initialiseMedia,
    playFrom: playFrom,
    beginPlayback: beginPlayback,
    beginPlaybackFrom: beginPlaybackFrom,
    resume: resume,
    pause: pause,
    stop: stop,
    reset: reset,
    getSeekableRange: getSeekableRange,
    getState: getState,
    getPlayerElement: getPlayerElement,
    getSource: getSource,
    getMimeType: getMimeType,
    getCurrentTime: getCurrentTime,
    getDuration: getDuration,
    toPaused: toPaused,
    toPlaying: toPlaying,
  }
}

/**
 * @preserve Copyright (c) 2017-present British Broadcasting Corporation. All rights reserved.
 * @license See https://github.com/fmtvp/tal/blob/master/LICENSE for full licence
 */

function SamsungStreaming2015() {
  let state = MediaPlayerBase.STATE.EMPTY;
  let currentPlayer;
  let deferSeekingTo = null;
  let nextSeekingTo = null;
  let postBufferingState = null;
  let tryingToPause = false;
  let currentTimeKnown = false;
  let updatingTime = false;
  let lastWindowRanged = false;

  let mediaType;
  let source;
  let mimeType;

  let range;
  let currentTime;

  let eventCallbacks = [];
  let eventCallback;

  let playerPlugin;
  let tvmwPlugin;
  let originalSource;

  try {
    _registerSamsungPlugins();
  } catch (ignoreErr) {}

  const PlayerEventCodes = {
    CONNECTION_FAILED: 1,
    AUTHENTICATION_FAILED: 2,
    STREAM_NOT_FOUND: 3,
    NETWORK_DISCONNECTED: 4,
    NETWORK_SLOW: 5,
    RENDER_ERROR: 6,
    RENDERING_START: 7,
    RENDERING_COMPLETE: 8,
    STREAM_INFO_READY: 9,
    DECODING_COMPLETE: 10,
    BUFFERING_START: 11,
    BUFFERING_COMPLETE: 12,
    BUFFERING_PROGRESS: 13,
    CURRENT_PLAYBACK_TIME: 14,
    AD_START: 15,
    AD_END: 16,
    RESOLUTION_CHANGED: 17,
    BITRATE_CHANGED: 18,
    SUBTITLE: 19,
    CUSTOM: 20,
  };

  const PlayerEmps = {
    Player: 0,
    StreamingPlayer: 1,
  };

  /**
   * @constant {Number} Time (in seconds) compared to current time within which seeking has no effect.
   * Jumping to time lower than 3s causes error in PlayFrom60 on HLS live - player jumps to previous chunk.
   * Value set to 4s to be ahead of potential wrong player jumps.
   */
  const CURRENT_TIME_TOLERANCE = 4;
  const CLAMP_OFFSET_FROM_END_OF_LIVE_RANGE = 10;
  const CLAMP_OFFSET_FROM_START_OF_RANGE = 1.1;
  const CLAMP_OFFSET_FROM_END_OF_RANGE = 1.1;
  const RANGE_UPDATE_TOLERANCE = 8;
  const RANGE_END_TOLERANCE = 100;

  function initialiseMedia(type, url, mediaMimeType) {
    if (this.getState() === MediaPlayerBase.STATE.EMPTY) {
      mediaType = type;
      source = url;
      mimeType = mediaMimeType;
      _registerEventHandlers();
      _toStopped();

      if (_isHlsMimeType()) {
        source += "|COMPONENT=HLS";
      }
      _openPlayerPlugin();

      _initPlayer(source);
    } else {
      _toError("Cannot set source unless in the '" + MediaPlayerBase.STATE.EMPTY + "' state");
    }
  }

  function resume() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.PLAYING:
        break

      case MediaPlayerBase.STATE.BUFFERING:
        if (tryingToPause) {
          tryingToPause = false;
          toPlaying();
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        playerPlugin.Execute("Resume");
        toPlaying();
        break

      default:
        _toError("Cannot resume while in the '" + getState() + "' state");
        break
    }
  }

  function playFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    const seekingTo = range ? _getClampedTimeForPlayFrom(seconds) : seconds;

    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
        // deferSeekingTo = seekingTo;
        nextSeekingTo = seekingTo;
        break

      case MediaPlayerBase.STATE.PLAYING:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
        }
        break

      case MediaPlayerBase.STATE.PAUSED:
        _toBuffering();
        if (!currentTimeKnown) {
          deferSeekingTo = seekingTo;
        } else if (_isNearToCurrentTime(seekingTo)) {
          playerPlugin.Execute("Resume");
          toPlaying();
        } else {
          _seekToWithFailureStateTransition(seekingTo);
          playerPlugin.Execute("Resume");
        }
        break

      case MediaPlayerBase.STATE.COMPLETE:
        playerPlugin.Execute("Stop");
        _initPlayer(source);
        playerPlugin.Execute("StartPlayback", seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot playFrom while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlayback() {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        _toBuffering();
        playerPlugin.Execute("StartPlayback");
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function beginPlaybackFrom(seconds) {
    postBufferingState = MediaPlayerBase.STATE.PLAYING;
    let seekingTo = getSeekableRange() ? _getClampedTimeForPlayFrom(seconds) : seconds;

    // StartPlayback from near start of range causes spoiler defect
    if (seekingTo < CLAMP_OFFSET_FROM_START_OF_RANGE && _isLiveMedia()) {
      seekingTo = CLAMP_OFFSET_FROM_START_OF_RANGE;
    } else {
      seekingTo = parseInt(Math.floor(seekingTo), 10);
    }

    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        playerPlugin.Execute("StartPlayback", seekingTo);
        _toBuffering();
        break

      default:
        _toError("Cannot beginPlayback while in the '" + getState() + "' state");
        break
    }
  }

  function pause() {
    postBufferingState = MediaPlayerBase.STATE.PAUSED;
    switch (getState()) {
      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PAUSED:
        break

      case MediaPlayerBase.STATE.PLAYING:
        _tryPauseWithStateTransition();
        break

      default:
        _toError("Cannot pause while in the '" + getState() + "' state");
        break
    }
  }

  function stop() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
        break

      case MediaPlayerBase.STATE.BUFFERING:
      case MediaPlayerBase.STATE.PLAYING:
      case MediaPlayerBase.STATE.PAUSED:
      case MediaPlayerBase.STATE.COMPLETE:
        _stopPlayer();
        _toStopped();
        break

      default:
        _toError("Cannot stop while in the '" + getState() + "' state");
        break
    }
  }

  function reset() {
    switch (getState()) {
      case MediaPlayerBase.STATE.EMPTY:
        break

      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        _toEmpty();
        break

      default:
        _toError("Cannot reset while in the '" + getState() + "' state");
        break
    }
  }

  function getSource() {
    return source
  }

  function getMimeType() {
    return mimeType
  }

  function getCurrentTime() {
    if (getState() === MediaPlayerBase.STATE.STOPPED) {
      return undefined
    } else {
      return currentTime
    }
  }

  function getSeekableRange() {
    switch (getState()) {
      case MediaPlayerBase.STATE.STOPPED:
      case MediaPlayerBase.STATE.ERROR:
        break

      default:
        return range
    }

    return undefined
  }

  function getDuration() {
    if (range) {
      return range.end
    }

    return undefined
  }

  function getState() {
    return state
  }

  function getPlayerElement() {
    return playerPlugin
  }

  function toPlaying() {
    if (_isHlsMimeType() && _isLiveMedia() && !updatingTime) {
      _updateRange();
    }

    state = MediaPlayerBase.STATE.PLAYING;
    _emitEvent(MediaPlayerBase.EVENT.PLAYING);
  }

  function toPaused() {
    state = MediaPlayerBase.STATE.PAUSED;
    _emitEvent(MediaPlayerBase.EVENT.PAUSED);
  }

  function _toStopped() {
    currentTime = 0;
    range = undefined;
    state = MediaPlayerBase.STATE.STOPPED;
    _emitEvent(MediaPlayerBase.EVENT.STOPPED);
  }

  function _toBuffering() {
    state = MediaPlayerBase.STATE.BUFFERING;
    _emitEvent(MediaPlayerBase.EVENT.BUFFERING);
  }

  function _toComplete() {
    state = MediaPlayerBase.STATE.COMPLETE;
    _emitEvent(MediaPlayerBase.EVENT.COMPLETE);
  }

  function _toEmpty() {
    _wipe();
    state = MediaPlayerBase.STATE.EMPTY;
  }

  function _toError(errorMessage) {
    _wipe();
    state = MediaPlayerBase.STATE.ERROR;
    _reportError(errorMessage);
    throw new Error("ApiError: " + errorMessage)
  }

  function _registerSamsungPlugins() {
    playerPlugin = document.getElementById("sefPlayer");
    tvmwPlugin = document.getElementById("pluginObjectTVMW");
    originalSource = tvmwPlugin.GetSource();
    window.addEventListener(
      "hide",
      () => {
        stop();
        tvmwPlugin.SetSource(originalSource);
      },
      false
    );
  }

  function _getClampedTime(seconds) {
    const range = getSeekableRange();
    const offsetFromEnd = _getClampOffsetFromConfig();
    const nearToEnd = Math.max(range.end - offsetFromEnd, range.start);

    if (seconds < range.start) {
      return range.start
    } else if (seconds > nearToEnd) {
      return nearToEnd
    } else {
      return seconds
    }
  }

  function _openPlayerPlugin() {
    if (currentPlayer !== undefined) {
      playerPlugin.Close();
    }

    playerPlugin.Open("Player", "1.010", "Player");
    currentPlayer = PlayerEmps.Player;
  }

  function _isLiveRangeOutdated() {
    const time = Math.floor(currentTime);

    if (time % 8 === 0 && !updatingTime && lastWindowRanged !== time) {
      lastWindowRanged = time;
      return true
    } else {
      return false
    }
  }

  function _closePlugin() {
    playerPlugin.Close();
    currentPlayer = undefined;
  }

  function _initPlayer(source) {
    const result = playerPlugin.Execute("InitPlayer", source);

    if (result !== 1) {
      _toError("Failed to initialize video: " + source);
    }
  }

  function _onFinishedBuffering() {
    if (getState() !== MediaPlayerBase.STATE.BUFFERING) {
      return
    }

    if (!_isInitialBufferingFinished() && nextSeekingTo !== null) {
      deferSeekingTo = nextSeekingTo;
      nextSeekingTo = null;
    }

    if (deferSeekingTo === null) {
      if (postBufferingState === MediaPlayerBase.STATE.PAUSED) {
        _tryPauseWithStateTransition();
      } else {
        toPlaying();
      }
    }
  }

  function _onDeviceError(message) {
    _reportError(message);
  }

  function _onDeviceBuffering() {
    if (getState() === MediaPlayerBase.STATE.PLAYING) {
      _toBuffering();
    }
  }

  function _onEndOfMedia() {
    _toComplete();
  }

  function _stopPlayer() {
    playerPlugin.Execute("Stop");
    currentTimeKnown = false;
  }

  function _tryPauseWithStateTransition() {
    let success = playerPlugin.Execute("Pause");
    success = success && success !== -1;

    if (success) {
      toPaused();
    }

    tryingToPause = !success;
  }

  function _onStatus() {
    const state = getState();

    if (state === MediaPlayerBase.STATE.PLAYING) {
      _emitEvent(MediaPlayerBase.EVENT.STATUS);
    }
  }

  function _updateRange() {
    if (_isHlsMimeType() && _isLiveMedia()) {
      const playingRange = playerPlugin.Execute("GetLiveDuration").split("|");

      range = {
        start: Math.floor(playingRange[0] / 1000),
        end: Math.floor(playingRange[1] / 1000),
      };

      // don't call range for the next 8 seconds
      updatingTime = true;
      setTimeout(() => {
        updatingTime = false;
      }, RANGE_UPDATE_TOLERANCE * 1000);
    } else {
      const duration = playerPlugin.Execute("GetDuration") / 1000;
      range = {
        start: 0,
        end: duration,
      };
    }
  }

  function _onCurrentTime(timeInMillis) {
    currentTime = timeInMillis / 1000;
    _onStatus();
    currentTimeKnown = true;

    // [optimisation] do not call player API periodically in HLS live
    // - calculate range manually when possible
    // - do not calculate range if player API was called less than RANGE_UPDATE_TOLERANCE seconds ago
    if (_isLiveMedia() && _isLiveRangeOutdated()) {
      range.start += 8;
      range.end += 8;
    }

    if (nextSeekingTo !== null) {
      deferSeekingTo = nextSeekingTo;
      nextSeekingTo = null;
    }

    if (deferSeekingTo !== null) {
      _deferredSeek();
    }

    if (tryingToPause) {
      _tryPauseWithStateTransition();
    }
  }

  function _deferredSeek() {
    const clampedTime = _getClampedTimeForPlayFrom(deferSeekingTo);
    const isNearCurrentTime = _isNearToCurrentTime(clampedTime);

    if (isNearCurrentTime) {
      toPlaying();
      deferSeekingTo = null;
    } else {
      const seekResult = _seekTo(clampedTime);
      if (seekResult) {
        deferSeekingTo = null;
      }
    }
  }

  function _getClampedTimeForPlayFrom(seconds) {
    if (_isHlsMimeType() && _isLiveMedia() && !updatingTime) {
      _updateRange();
    }

    const clampedTime = _getClampedTime(seconds);

    if (clampedTime !== seconds) {
      DebugToolInstance.info(
        "playFrom " +
          seconds +
          " clamped to " +
          clampedTime +
          " - seekable range is { start: " +
          range.start +
          ", end: " +
          range.end +
          " }"
      );
    }

    return clampedTime
  }

  function _getClampOffsetFromConfig() {
    if (_isLiveMedia()) {
      return CLAMP_OFFSET_FROM_END_OF_LIVE_RANGE
    } else {
      return CLAMP_OFFSET_FROM_END_OF_RANGE
    }
  }

  function _registerEventHandlers() {
    playerPlugin.OnEvent = (eventType, param1) => {
      switch (eventType) {
        case PlayerEventCodes.STREAM_INFO_READY:
          _updateRange();
          break

        case PlayerEventCodes.CURRENT_PLAYBACK_TIME:
          if (range && _isLiveMedia()) {
            const seconds = Math.floor(param1 / 1000);

            // jump to previous current time if PTS out of range occurs
            if (seconds > range.end + RANGE_END_TOLERANCE) {
              playFrom(currentTime);
              break
              // call GetPlayingRange() on SEF emp if current time is out of range
            } else if (!_isCurrentTimeInRangeTolerance(seconds)) {
              _updateRange();
            }
          }
          _onCurrentTime(param1);
          break

        case PlayerEventCodes.BUFFERING_START:
        case PlayerEventCodes.BUFFERING_PROGRESS:
          _onDeviceBuffering();
          break

        case PlayerEventCodes.BUFFERING_COMPLETE:
          // For live HLS, don't update the range more than once every 8 seconds
          if (!updatingTime) {
            _updateRange();
          }

          // [optimisation] if Stop() is not called after RENDERING_COMPLETE then player sends periodically BUFFERING_COMPLETE and RENDERING_COMPLETE
          // ignore BUFFERING_COMPLETE if player is already in COMPLETE state
          if (getState() !== MediaPlayerBase.STATE.COMPLETE) {
            _onFinishedBuffering();
          }
          break

        case PlayerEventCodes.RENDERING_COMPLETE:
          // [optimisation] if Stop() is not called after RENDERING_COMPLETE then player sends periodically BUFFERING_COMPLETE and RENDERING_COMPLETE
          // ignore RENDERING_COMPLETE if player is already in COMPLETE state
          if (getState() !== MediaPlayerBase.STATE.COMPLETE) {
            _onEndOfMedia();
          }
          break

        case PlayerEventCodes.CONNECTION_FAILED:
          _onDeviceError("Media element emitted OnConnectionFailed");
          break

        case PlayerEventCodes.NETWORK_DISCONNECTED:
          _onDeviceError("Media element emitted OnNetworkDisconnected");
          break

        case PlayerEventCodes.AUTHENTICATION_FAILED:
          _onDeviceError("Media element emitted OnAuthenticationFailed");
          break

        case PlayerEventCodes.RENDER_ERROR:
          _onDeviceError("Media element emitted OnRenderError");
          break

        case PlayerEventCodes.STREAM_NOT_FOUND:
          _onDeviceError("Media element emitted OnStreamNotFound");
          break
      }
    };

    window.addEventListener("hide", _onWindowHide, false);
    window.addEventListener("unload", _onWindowHide, false);
  }

  function _onWindowHide() {
    stop();
  }

  function _unregisterEventHandlers() {
    playerPlugin.OnEvent = undefined;
    window.removeEventListener("hide", _onWindowHide, false);
    window.removeEventListener("unload", _onWindowHide, false);
  }

  function _wipe() {
    _stopPlayer();
    _closePlugin();
    _unregisterEventHandlers();

    mediaType = undefined;
    source = undefined;
    mimeType = undefined;
    currentTime = undefined;
    range = undefined;
    deferSeekingTo = null;
    nextSeekingTo = null;
    tryingToPause = false;
    currentTimeKnown = false;
    updatingTime = false;
    lastWindowRanged = false;
  }

  function _seekTo(seconds) {
    const offset = seconds - getCurrentTime();
    const success = _jump(offset);

    if (success === 1) {
      currentTime = seconds;
    }

    return success
  }

  function _seekToWithFailureStateTransition(seconds) {
    const success = _seekTo(seconds);

    if (success !== 1) {
      toPlaying();
    }
  }

  function _jump(offsetSeconds) {
    let result;

    if (offsetSeconds > 0) {
      result = playerPlugin.Execute("JumpForward", offsetSeconds);
      return result
    } else {
      result = playerPlugin.Execute("JumpBackward", Math.abs(offsetSeconds));
      return result
    }
  }

  function _isHlsMimeType() {
    const mime = mimeType.toLowerCase();
    return mime === "application/vnd.apple.mpegurl" || mime === "application/x-mpegurl"
  }

  function _isCurrentTimeInRangeTolerance(seconds) {
    if (seconds > range.end + RANGE_UPDATE_TOLERANCE) {
      return false
    } else if (seconds < range.start - RANGE_UPDATE_TOLERANCE) {
      return false
    } else {
      return true
    }
  }

  function _isInitialBufferingFinished() {
    if (currentTime === undefined || currentTime === 0) {
      return false
    } else {
      return true
    }
  }

  function _reportError(errorMessage) {
    DebugToolInstance.info(errorMessage);
    _emitEvent(MediaPlayerBase.EVENT.ERROR, { errorMessage: errorMessage });
  }

  function _isNearToCurrentTime(seconds) {
    const currentTime = getCurrentTime();
    const targetTime = _getClampedTime(seconds);

    return Math.abs(currentTime - targetTime) <= CURRENT_TIME_TOLERANCE
  }

  function _isLiveMedia() {
    return mediaType === MediaPlayerBase.TYPE.LIVE_VIDEO || mediaType === MediaPlayerBase.TYPE.LIVE_AUDIO
  }

  function _emitEvent(eventType, eventLabels) {
    const event = {
      type: eventType,
      currentTime: getCurrentTime(),
      seekableRange: getSeekableRange(),
      duration: getDuration(),
      url: getSource(),
      mimeType: getMimeType(),
      state: getState(),
    };

    if (eventLabels) {
      for (const key in eventLabels) {
        if (eventLabels.hasOwnProperty(key)) {
          event[key] = eventLabels[key];
        }
      }
    }

    for (let index = 0; index < eventCallbacks.length; index++) {
      eventCallbacks[index](event);
    }
  }

  return {
    addEventCallback: (thisArg, newCallback) => {
      eventCallback = (event) => newCallback.call(thisArg, event);
      eventCallbacks.push(eventCallback);
    },

    removeEventCallback: (callback) => {
      const index = eventCallbacks.indexOf(callback);

      if (index !== -1) {
        eventCallbacks.splice(index, 1);
      }
    },

    removeAllEventCallbacks: () => {
      eventCallbacks = [];
    },

    initialiseMedia: initialiseMedia,
    playFrom: playFrom,
    beginPlayback: beginPlayback,
    beginPlaybackFrom: beginPlaybackFrom,
    resume: resume,
    pause: pause,
    stop: stop,
    reset: reset,
    getSeekableRange: getSeekableRange,
    getState: getState,
    getPlayerElement: getPlayerElement,
    getSource: getSource,
    getMimeType: getMimeType,
    getCurrentTime: getCurrentTime,
    getDuration: getDuration,
    toPaused: toPaused,
    toPlaying: toPlaying,
  }
}

function None() {
  throw new Error("Cannot create a none live support player")
}

function PlayableLivePlayer(mediaPlayer) {
  return {
    initialiseMedia: (mediaType, sourceUrl, mimeType, sourceContainer, opts) => {
      if (mediaType === MediaPlayerBase.TYPE.AUDIO) {
        mediaType = MediaPlayerBase.TYPE.LIVE_AUDIO;
      } else {
        mediaType = MediaPlayerBase.TYPE.LIVE_VIDEO;
      }

      mediaPlayer.initialiseMedia(mediaType, sourceUrl, mimeType, sourceContainer, opts);
    },

    beginPlayback: () => mediaPlayer.beginPlayback(),
    stop: () => mediaPlayer.stop(),
    reset: () => mediaPlayer.reset(),
    getState: () => mediaPlayer.getState(),
    getSource: () => mediaPlayer.getSource(),
    getMimeType: () => mediaPlayer.getMimeType(),

    addEventCallback: (thisArg, callback) => mediaPlayer.addEventCallback(thisArg, callback),

    removeEventCallback: (thisArg, callback) => mediaPlayer.removeEventCallback(thisArg, callback),

    removeAllEventCallbacks: () => mediaPlayer.removeAllEventCallbacks(),

    getPlayerElement: () => mediaPlayer.getPlayerElement(),
  }
}

const AUTO_RESUME_WINDOW_START_CUSHION_SECONDS = 8;
const FOUR_MINUTES = 4 * 60;

function convertMilliSecondsToSeconds$1(timeInMilis) {
  return Math.floor(timeInMilis / 1000)
}

function hasFiniteSeekableRange(seekableRange) {
  let hasRange = true;
  try {
    hasRange = seekableRange.end !== Infinity;
  } catch (_error) {
    /* empty */
  }
  return hasRange
}

function canSeek(windowStart, windowEnd, liveSupport, seekableRange) {
  return (
    supportsSeeking(liveSupport) &&
    initialWindowIsBigEnoughForSeeking(windowStart, windowEnd) &&
    hasFiniteSeekableRange(seekableRange)
  )
}

function canPause(windowStart, windowEnd, liveSupport) {
  return supportsPause(liveSupport) && initialWindowIsBigEnoughForSeeking(windowStart, windowEnd)
}

function initialWindowIsBigEnoughForSeeking(windowStart, windowEnd) {
  const start = convertMilliSecondsToSeconds$1(windowStart);
  const end = convertMilliSecondsToSeconds$1(windowEnd);
  return end - start > FOUR_MINUTES
}

function supportsPause(liveSupport) {
  return liveSupport === LiveSupport.SEEKABLE || liveSupport === LiveSupport.RESTARTABLE
}

function supportsSeeking(liveSupport) {
  return (
    liveSupport === LiveSupport.SEEKABLE ||
    (liveSupport === LiveSupport.RESTARTABLE && window.bigscreenPlayer.playbackStrategy === "nativestrategy")
  )
}

function autoResumeAtStartOfRange(
  currentTime,
  seekableRange,
  addEventCallback,
  removeEventCallback,
  checkNotPauseEvent,
  resume
) {
  const resumeTimeOut = Math.max(0, currentTime - seekableRange.start - AUTO_RESUME_WINDOW_START_CUSHION_SECONDS);
  DebugToolInstance.dynamicMetric("auto-resume", resumeTimeOut);
  const autoResumeTimer = setTimeout(() => {
    removeEventCallback(undefined, detectIfUnpaused);
    resume();
  }, resumeTimeOut * 1000);

  addEventCallback(undefined, detectIfUnpaused);

  function detectIfUnpaused(event) {
    if (checkNotPauseEvent(event)) {
      removeEventCallback(undefined, detectIfUnpaused);
      clearTimeout(autoResumeTimer);
    }
  }
}

var DynamicWindowUtils = {
  autoResumeAtStartOfRange,
  canPause,
  canSeek,
};

function RestartableLivePlayer(mediaPlayer, windowType, mediaSources) {
  const fakeTimer = {};
  const timeCorrection = mediaSources.time()?.timeCorrectionSeconds || 0;

  let callbacksMap = [];
  let startTime;

  addEventCallback(this, updateFakeTimer);

  function updateFakeTimer(event) {
    if (fakeTimer.wasPlaying && fakeTimer.runningTime) {
      fakeTimer.currentTime += (Date.now() - fakeTimer.runningTime) / 1000;
    }

    fakeTimer.runningTime = Date.now();
    fakeTimer.wasPlaying = event.state === MediaPlayerBase.STATE.PLAYING;
  }

  function addEventCallback(thisArg, callback) {
    function newCallback(event) {
      event.currentTime = getCurrentTime();
      event.seekableRange = getSeekableRange();
      callback(event);
    }

    callbacksMap.push({ from: callback, to: newCallback });
    mediaPlayer.addEventCallback(thisArg, newCallback);
  }

  function removeEventCallback(thisArg, callback) {
    const filteredCallbacks = callbacksMap.filter((cb) => cb.from === callback);

    if (filteredCallbacks.length > 0) {
      callbacksMap = callbacksMap.splice(callbacksMap.indexOf(filteredCallbacks[0]));

      mediaPlayer.removeEventCallback(thisArg, filteredCallbacks[0].to);
    }
  }

  function removeAllEventCallbacks() {
    mediaPlayer.removeAllEventCallbacks();
  }

  function pause(opts = {}) {
    mediaPlayer.pause();

    if (opts.disableAutoResume !== true && windowType === WindowTypes.SLIDING) {
      DynamicWindowUtils.autoResumeAtStartOfRange(
        getCurrentTime(),
        getSeekableRange(),
        addEventCallback,
        removeEventCallback,
        MediaPlayerBase.unpausedEventCheck,
        resume
      );
    }
  }

  function resume() {
    mediaPlayer.resume();
  }

  function getCurrentTime() {
    return fakeTimer.currentTime + timeCorrection
  }

  function getSeekableRange() {
    const windowLength = (mediaSources.time().windowEndTime - mediaSources.time().windowStartTime) / 1000;
    const delta = (Date.now() - startTime) / 1000;

    return {
      start: (windowType === WindowTypes.SLIDING ? delta : 0) + timeCorrection,
      end: windowLength + delta + timeCorrection,
    }
  }

  return {
    beginPlayback: () => {
      startTime = Date.now();
      fakeTimer.currentTime = (mediaSources.time().windowEndTime - mediaSources.time().windowStartTime) / 1000;

      if (
        window.bigscreenPlayer &&
        window.bigscreenPlayer.overrides &&
        window.bigscreenPlayer.overrides.forceBeginPlaybackToEndOfWindow
      ) {
        mediaPlayer.beginPlaybackFrom(Infinity);
      } else {
        mediaPlayer.beginPlayback();
      }
    },

    beginPlaybackFrom: (offset) => {
      startTime = Date.now();
      fakeTimer.currentTime = offset;
      mediaPlayer.beginPlaybackFrom(offset);
    },

    initialiseMedia: (mediaType, sourceUrl, mimeType, sourceContainer, opts) => {
      const mediaSubType =
        mediaType === MediaPlayerBase.TYPE.AUDIO ? MediaPlayerBase.TYPE.LIVE_AUDIO : MediaPlayerBase.TYPE.LIVE_VIDEO;

      mediaPlayer.initialiseMedia(mediaSubType, sourceUrl, mimeType, sourceContainer, opts);
    },

    pause,
    resume,
    stop: () => mediaPlayer.stop(),
    reset: () => mediaPlayer.reset(),
    getState: () => mediaPlayer.getState(),
    getSource: () => mediaPlayer.getSource(),
    getMimeType: () => mediaPlayer.getMimeType(),
    addEventCallback,
    removeEventCallback,
    removeAllEventCallbacks,
    getPlayerElement: () => mediaPlayer.getPlayerElement(),
    getCurrentTime,
    getSeekableRange,
  }
}

function SeekableLivePlayer(mediaPlayer, windowType) {
  const AUTO_RESUME_WINDOW_START_CUSHION_SECONDS = 8;

  function addEventCallback(thisArg, callback) {
    mediaPlayer.addEventCallback(thisArg, callback);
  }

  function removeEventCallback(thisArg, callback) {
    mediaPlayer.removeEventCallback(thisArg, callback);
  }

  function removeAllEventCallbacks() {
    mediaPlayer.removeAllEventCallbacks();
  }

  function resume() {
    mediaPlayer.resume();
  }

  return {
    initialiseMedia: function initialiseMedia(mediaType, sourceUrl, mimeType, sourceContainer, opts) {
      if (mediaType === MediaPlayerBase.TYPE.AUDIO) {
        mediaType = MediaPlayerBase.TYPE.LIVE_AUDIO;
      } else {
        mediaType = MediaPlayerBase.TYPE.LIVE_VIDEO;
      }

      mediaPlayer.initialiseMedia(mediaType, sourceUrl, mimeType, sourceContainer, opts);
    },

    beginPlayback: function beginPlayback() {
      if (
        window.bigscreenPlayer &&
        window.bigscreenPlayer.overrides &&
        window.bigscreenPlayer.overrides.forceBeginPlaybackToEndOfWindow
      ) {
        mediaPlayer.beginPlaybackFrom(Infinity);
      } else {
        mediaPlayer.beginPlayback();
      }
    },

    beginPlaybackFrom: function beginPlaybackFrom(offset) {
      mediaPlayer.beginPlaybackFrom(offset);
    },

    playFrom: function playFrom(offset) {
      mediaPlayer.playFrom(offset);
    },

    pause: function pause(opts) {
      const secondsUntilStartOfWindow = mediaPlayer.getCurrentTime() - mediaPlayer.getSeekableRange().start;
      opts = opts || {};

      if (opts.disableAutoResume) {
        mediaPlayer.pause();
      } else if (secondsUntilStartOfWindow <= AUTO_RESUME_WINDOW_START_CUSHION_SECONDS) {
        mediaPlayer.toPaused();
        mediaPlayer.toPlaying();
      } else {
        mediaPlayer.pause();
        if (windowType === WindowTypes.SLIDING) {
          DynamicWindowUtils.autoResumeAtStartOfRange(
            mediaPlayer.getCurrentTime(),
            mediaPlayer.getSeekableRange(),
            addEventCallback,
            removeEventCallback,
            MediaPlayerBase.unpausedEventCheck,
            resume
          );
        }
      }
    },

    resume: resume,
    stop: () => mediaPlayer.stop(),
    reset: () => mediaPlayer.reset(),
    getState: () => mediaPlayer.getState(),
    getSource: () => mediaPlayer.getSource(),
    getCurrentTime: () => mediaPlayer.getCurrentTime(),
    getSeekableRange: () => mediaPlayer.getSeekableRange(),
    getMimeType: () => mediaPlayer.getMimeType(),
    addEventCallback: addEventCallback,
    removeEventCallback: removeEventCallback,
    removeAllEventCallbacks: removeAllEventCallbacks,
    getPlayerElement: () => mediaPlayer.getPlayerElement(),
    getLiveSupport: () => MediaPlayerBase.LIVE_SUPPORT.SEEKABLE,
  }
}

function NativeStrategy(mediaSources, windowType, mediaKind, playbackElement, isUHD) {
  let mediaPlayer;

  switch (window.bigscreenPlayer.mediaPlayer) {
    case "cehtml":
      mediaPlayer = Cehtml();
      break
    case "html5":
      mediaPlayer = Html5();
      break
    case "samsungmaple":
      mediaPlayer = SamsungMaple();
      break
    case "samsungstreaming":
      mediaPlayer = SamsungStreaming();
      break
    case "samsungstreaming2015":
      mediaPlayer = SamsungStreaming2015();
      break
    default:
      mediaPlayer = Html5();
  }

  if (windowType !== WindowTypes.STATIC) {
    switch (window.bigscreenPlayer.liveSupport) {
      case "none":
        mediaPlayer = None();
        break
      case "playable":
        mediaPlayer = PlayableLivePlayer(mediaPlayer);
        break
      case "restartable":
        mediaPlayer = RestartableLivePlayer(mediaPlayer, windowType, mediaSources);
        break
      case "seekable":
        mediaPlayer = SeekableLivePlayer(mediaPlayer, windowType);
        break
      default:
        mediaPlayer = PlayableLivePlayer(mediaPlayer);
    }
  }

  return LegacyPlayerAdapter(mediaSources, windowType, playbackElement, isUHD, mediaPlayer)
}

NativeStrategy.getLiveSupport = () => window.bigscreenPlayer.liveSupport;

const MediaKinds = {
    AUDIO: "audio",
    VIDEO: "video",
};

function BasicStrategy(mediaSources, windowType, mediaKind, playbackElement) {
  const CLAMP_OFFSET_SECONDS = 1.1;

  let eventCallbacks = [];
  let errorCallback;
  let timeUpdateCallback;

  let mediaElement;
  let metaDataLoaded;
  let timeCorrection = mediaSources.time()?.timeCorrectionSeconds || 0;

  function publishMediaState(mediaState) {
    for (let index = 0; index < eventCallbacks.length; index++) {
      eventCallbacks[index](mediaState);
    }
  }

  function publishTimeUpdate() {
    if (timeUpdateCallback) {
      timeUpdateCallback();
    }
  }

  function publishError(mediaError) {
    if (errorCallback) {
      errorCallback(mediaError);
    }
  }

  function load(_mimeType, startTime) {
    if (mediaElement == null) {
      setUpMediaElement(startTime);
      setUpMediaListeners();

      return
    }

    mediaElement.src = mediaSources.currentSource();
    setStartTime(startTime);
    mediaElement.load();
  }

  function setUpMediaElement(startTime) {
    mediaElement = mediaKind === MediaKinds.AUDIO ? document.createElement("audio") : document.createElement("video");

    mediaElement.style.position = "absolute";
    mediaElement.style.width = "100%";
    mediaElement.style.height = "100%";
    mediaElement.autoplay = true;
    mediaElement.preload = "auto";
    mediaElement.src = mediaSources.currentSource();

    playbackElement.insertBefore(mediaElement, playbackElement.firstChild);

    setStartTime(startTime);
    mediaElement.load();
  }

  function setUpMediaListeners() {
    mediaElement.addEventListener("timeupdate", onTimeUpdate);
    mediaElement.addEventListener("playing", onPlaying);
    mediaElement.addEventListener("pause", onPaused);
    mediaElement.addEventListener("waiting", onWaiting);
    mediaElement.addEventListener("seeking", onSeeking);
    mediaElement.addEventListener("seeked", onSeeked);
    mediaElement.addEventListener("ended", onEnded);
    mediaElement.addEventListener("error", onError);
    mediaElement.addEventListener("loadedmetadata", onLoadedMetadata);
  }

  function setStartTime(startTime) {
    if (startTime) {
      mediaElement.currentTime = startTime + timeCorrection;
    }
  }

  function onPlaying() {
    publishMediaState(MediaState.PLAYING);
  }

  function onPaused() {
    publishMediaState(MediaState.PAUSED);
  }

  function onSeeking() {
    publishMediaState(MediaState.WAITING);
  }

  function onWaiting() {
    publishMediaState(MediaState.WAITING);
  }

  function onSeeked() {
    if (isPaused()) {
      if (windowType === WindowTypes.SLIDING) {
        startAutoResumeTimeout();
      }

      publishMediaState(MediaState.PAUSED);
    } else {
      publishMediaState(MediaState.PLAYING);
    }
  }

  function onEnded() {
    publishMediaState(MediaState.ENDED);
  }

  function onTimeUpdate() {
    DebugToolInstance.updateElementTime(mediaElement.currentTime);

    publishTimeUpdate();
  }

  function onError(_event) {
    const mediaError = {
      code: (mediaElement && mediaElement.error && mediaElement.error.code) || 0,
      message: (mediaElement && mediaElement.error && mediaElement.error.message) || "unknown",
    };
    publishError(mediaError);
  }

  function onLoadedMetadata() {
    metaDataLoaded = true;
  }

  function isPaused() {
    return mediaElement.paused
  }

  function getSeekableRange() {
    if (mediaElement && mediaElement.seekable && mediaElement.seekable.length > 0 && metaDataLoaded) {
      return {
        start: mediaElement.seekable.start(0) - timeCorrection,
        end: mediaElement.seekable.end(0) - timeCorrection,
      }
    }
    return {
      start: 0,
      end: 0,
    }
  }

  function getDuration() {
    if (mediaElement && metaDataLoaded) {
      return mediaElement.duration
    }

    return 0
  }

  function getCurrentTime() {
    return mediaElement ? mediaElement.currentTime - timeCorrection : 0
  }

  function addEventCallback(thisArg, newCallback) {
    const eventCallback = (event) => newCallback.call(thisArg, event);
    eventCallbacks.push(eventCallback);
  }

  function removeEventCallback(callback) {
    const index = eventCallbacks.indexOf(callback);

    if (index !== -1) {
      eventCallbacks.splice(index, 1);
    }
  }

  function startAutoResumeTimeout() {
    DynamicWindowUtils.autoResumeAtStartOfRange(
      getCurrentTime(),
      getSeekableRange(),
      addEventCallback,
      removeEventCallback,
      (event) => event !== MediaState.PAUSED,
      play
    );
  }

  function play() {
    handlePlayPromise(mediaElement.play());
  }

  function setCurrentTime(time) {
    // Without metadata we cannot clamp to seekableRange
    mediaElement.currentTime = metaDataLoaded
      ? getClampedTime(time, getSeekableRange()) + timeCorrection
      : time + timeCorrection;
  }

  function setPlaybackRate(rate) {
    mediaElement.playbackRate = rate;
  }

  function getPlaybackRate() {
    return mediaElement.playbackRate
  }

  function getClampedTime(time, range) {
    return Math.min(Math.max(time, range.start), range.end - CLAMP_OFFSET_SECONDS)
  }

  function addErrorCallback(thisArg, newErrorCallback) {
    errorCallback = (event) => newErrorCallback.call(thisArg, event);
  }

  function addTimeUpdateCallback(thisArg, newTimeUpdateCallback) {
    timeUpdateCallback = () => newTimeUpdateCallback.call(thisArg);
  }

  function tearDown() {
    if (mediaElement) {
      mediaElement.removeEventListener("timeupdate", onTimeUpdate);
      mediaElement.removeEventListener("playing", onPlaying);
      mediaElement.removeEventListener("pause", onPaused);
      mediaElement.removeEventListener("waiting", onWaiting);
      mediaElement.removeEventListener("seeking", onSeeking);
      mediaElement.removeEventListener("seeked", onSeeked);
      mediaElement.removeEventListener("ended", onEnded);
      mediaElement.removeEventListener("error", onError);
      mediaElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      mediaElement.removeAttribute("src");
      mediaElement.load();
      DOMHelpers.safeRemoveElement(mediaElement);
    }

    eventCallbacks = [];
    errorCallback = undefined;
    timeUpdateCallback = undefined;

    mediaElement = undefined;
    metaDataLoaded = undefined;
    timeCorrection = undefined;
  }

  function reset() {}

  function isEnded() {
    return mediaElement.ended
  }

  function pause(opts = {}) {
    mediaElement.pause();
    if (opts.disableAutoResume !== true && windowType === WindowTypes.SLIDING) {
      startAutoResumeTimeout();
    }
  }

  function getPlayerElement() {
    return mediaElement || undefined
  }

  return {
    transitions: {
      canBePaused: () => true,
      canBeginSeek: () => true,
    },
    addEventCallback,
    removeEventCallback,
    addErrorCallback,
    addTimeUpdateCallback,
    load,
    getSeekableRange,
    getCurrentTime,
    getDuration,
    tearDown,
    reset,
    isEnded,
    isPaused,
    pause,
    play,
    setCurrentTime,
    setPlaybackRate,
    getPlaybackRate,
    getPlayerElement,
  }
}

BasicStrategy.getLiveSupport = () => LiveSupport.SEEKABLE;

function StrategyPicker() {
  return new Promise((resolve, reject) => {
    if (window.bigscreenPlayer.playbackStrategy === PlaybackStrategy.MSE) {
      return import('./msestrategy-0c1d3c49.js')
        .then(({ default: MSEStrategy }) => resolve(MSEStrategy))
        .catch(() => {
          reject({ error: "strategyDynamicLoadError" });
        })
    } else if (window.bigscreenPlayer.playbackStrategy === PlaybackStrategy.BASIC) {
      return resolve(BasicStrategy)
    }
    return resolve(NativeStrategy)
  })
}

function PlayerComponent(
  playbackElement,
  bigscreenPlayerData,
  mediaSources,
  windowType,
  stateUpdateCallback,
  errorCallback
) {
  const transferFormat = bigscreenPlayerData.media.transferFormat;

  let _windowType = windowType;
  let _stateUpdateCallback = stateUpdateCallback;

  let mediaKind = bigscreenPlayerData.media.kind;
  let isInitialPlay = true;
  let errorTimeoutID = null;

  let playbackStrategy;
  let mediaMetaData;
  let fatalErrorTimeout;
  let fatalError;

  StrategyPicker()
    .then((strategy) => {
      playbackStrategy = strategy(
        mediaSources,
        _windowType,
        mediaKind,
        playbackElement,
        bigscreenPlayerData.media.isUHD,
        bigscreenPlayerData.media.playerSettings
      );

      playbackStrategy.addEventCallback(this, eventCallback);
      playbackStrategy.addErrorCallback(this, onError);
      playbackStrategy.addTimeUpdateCallback(this, onTimeUpdate);

      bubbleErrorCleared();

      mediaMetaData = bigscreenPlayerData.media;

      loadMedia(bigscreenPlayerData.media.type, bigscreenPlayerData.initialPlaybackTime);
    })
    .catch((error) => {
      errorCallback && errorCallback(error);
    });

  function play() {
    playbackStrategy && playbackStrategy.play();
  }

  function isEnded() {
    return playbackStrategy && playbackStrategy.isEnded()
  }

  function pause(opts = {}) {
    if (transitions().canBePaused()) {
      const disableAutoResume = _windowType === WindowTypes.GROWING ? true : opts.disableAutoResume;

      playbackStrategy && playbackStrategy.pause({ disableAutoResume, pauseTrigger: opts.pauseTrigger });
    }
  }

  function setSubtitles(state) {
    return playbackStrategy && playbackStrategy.setSubtitles(state)
  }

  function getDuration() {
    return playbackStrategy && playbackStrategy.getDuration()
  }

  function getWindowStartTime() {
    return mediaSources && mediaSources.time().windowStartTime
  }

  function getWindowEndTime() {
    return mediaSources && mediaSources.time().windowEndTime
  }

  function getPlayerElement() {
    let element = null;
    if (playbackStrategy && playbackStrategy.getPlayerElement) {
      element = playbackStrategy.getPlayerElement();
    }
    return element
  }

  function getCurrentTime() {
    return playbackStrategy && playbackStrategy.getCurrentTime()
  }

  function getSeekableRange() {
    return playbackStrategy && playbackStrategy.getSeekableRange()
  }

  function isPaused() {
    return playbackStrategy && playbackStrategy.isPaused()
  }

  function setCurrentTime(time) {
    if (transitions().canBeginSeek()) {
      isNativeHLSRestartable() ? reloadMediaElement(time) : playbackStrategy && playbackStrategy.setCurrentTime(time);
    }
  }

  function setPlaybackRate(rate) {
    playbackStrategy && playbackStrategy.setPlaybackRate(rate);
  }

  function getPlaybackRate() {
    return playbackStrategy && playbackStrategy.getPlaybackRate()
  }

  function isNativeHLSRestartable() {
    return (
      window.bigscreenPlayer.playbackStrategy === PlaybackStrategy.NATIVE &&
      transferFormat === TransferFormat.HLS &&
      _windowType !== WindowTypes.STATIC &&
      getLiveSupport$1() === LiveSupport.RESTARTABLE
    )
  }

  function reloadMediaElement(time) {
    const originalWindowStartOffset = getWindowStartTime();

    const doSeek = () => {
      const windowOffset = mediaSources.time().windowStartTime - originalWindowStartOffset;
      const seekableRange = playbackStrategy && playbackStrategy.getSeekableRange();

      let seekToTime = time - windowOffset / 1000;
      let thenPause = playbackStrategy && playbackStrategy.isPaused();

      tearDownMediaElement();

      if (seekToTime > seekableRange.end - seekableRange.start - 30) {
        seekToTime = undefined;
        thenPause = false;
      }

      loadMedia(mediaMetaData.type, seekToTime, thenPause);
    };

    const onError = () => {
      tearDownMediaElement();
      bubbleFatalError(false, {
        code: PluginEnums.ERROR_CODES.MANIFEST_LOAD,
        message: PluginEnums.ERROR_MESSAGES.MANIFEST,
      });
    };

    mediaSources.refresh(doSeek, onError);
  }

  function transitions() {
    return playbackStrategy && playbackStrategy.transitions
  }

  function tearDownMediaElement() {
    clearTimeouts();
    playbackStrategy && playbackStrategy.reset();
  }

  function eventCallback(mediaState) {
    switch (mediaState) {
      case MediaState.PLAYING:
        onPlaying();
        break

      case MediaState.PAUSED:
        onPaused();
        break

      case MediaState.WAITING:
        onBuffering();
        break

      case MediaState.ENDED:
        onEnded();
        break
    }
  }

  function onPlaying() {
    clearTimeouts();
    publishMediaStateUpdate(MediaState.PLAYING, {});
    isInitialPlay = false;
  }

  function onPaused() {
    publishMediaStateUpdate(MediaState.PAUSED);
    clearTimeouts();
  }

  function onBuffering() {
    publishMediaStateUpdate(MediaState.WAITING);
    startBufferingErrorTimeout();
    bubbleErrorCleared();
    bubbleBufferingRaised();
  }

  function onEnded() {
    clearTimeouts();
    publishMediaStateUpdate(MediaState.ENDED);
  }

  function onTimeUpdate() {
    publishMediaStateUpdate(undefined, { timeUpdate: true });
  }

  function onError(mediaError) {
    bubbleBufferingCleared();
    raiseError(mediaError);
  }

  function startBufferingErrorTimeout() {
    const bufferingTimeout = isInitialPlay ? 30000 : 20000;
    clearBufferingErrorTimeout();
    errorTimeoutID = setTimeout(() => {
      bubbleBufferingCleared();
      attemptCdnFailover({
        code: PluginEnums.ERROR_CODES.BUFFERING_TIMEOUT,
        message: PluginEnums.ERROR_MESSAGES.BUFFERING_TIMEOUT,
      });
    }, bufferingTimeout);
  }

  function raiseError(mediaError) {
    clearBufferingErrorTimeout();
    publishMediaStateUpdate(MediaState.WAITING);
    bubbleErrorRaised(mediaError);
    startFatalErrorTimeout(mediaError);
  }

  function startFatalErrorTimeout(mediaError) {
    if (!fatalErrorTimeout && !fatalError) {
      fatalErrorTimeout = setTimeout(() => {
        fatalErrorTimeout = null;
        fatalError = true;
        attemptCdnFailover(mediaError);
      }, 5000);
    }
  }

  function attemptCdnFailover(mediaError) {
    const time = getCurrentTime();
    const oldWindowStartTime = getWindowStartTime();
    const bufferingTimeoutError = mediaError.code === PluginEnums.ERROR_CODES.BUFFERING_TIMEOUT;

    const failoverParams = {
      isBufferingTimeoutError: bufferingTimeoutError,
      currentTime: getCurrentTime(),
      duration: getDuration(),
      code: mediaError.code,
      message: mediaError.message,
    };

    const doLoadMedia = () => {
      const thenPause = isPaused();
      const windowOffset = (mediaSources.time().windowStartTime - oldWindowStartTime) / 1000;
      const failoverTime = time - (windowOffset || 0);
      tearDownMediaElement();
      loadMedia(mediaMetaData.type, failoverTime, thenPause);
    };

    const doErrorCallback = () => {
      bubbleFatalError(bufferingTimeoutError, mediaError);
    };

    mediaSources.failover(doLoadMedia, doErrorCallback, failoverParams);
  }

  function clearFatalErrorTimeout() {
    if (fatalErrorTimeout !== null) {
      clearTimeout(fatalErrorTimeout);
      fatalErrorTimeout = null;
    }
  }

  function clearBufferingErrorTimeout() {
    if (errorTimeoutID !== null) {
      clearTimeout(errorTimeoutID);
      errorTimeoutID = null;
    }
  }

  function clearTimeouts() {
    clearBufferingErrorTimeout();
    clearFatalErrorTimeout();
    fatalError = false;
    bubbleBufferingCleared();
    bubbleErrorCleared();
  }

  function bubbleErrorCleared() {
    const evt = new PluginData({ status: PluginEnums.STATUS.DISMISSED, stateType: PluginEnums.TYPE.ERROR });
    Plugins.interface.onErrorCleared(evt);
  }

  function bubbleErrorRaised(mediaError) {
    const evt = new PluginData({
      status: PluginEnums.STATUS.STARTED,
      stateType: PluginEnums.TYPE.ERROR,
      isBufferingTimeoutError: false,
      code: mediaError.code,
      message: mediaError.message,
    });
    Plugins.interface.onError(evt);
  }

  function bubbleBufferingRaised() {
    const evt = new PluginData({ status: PluginEnums.STATUS.STARTED, stateType: PluginEnums.TYPE.BUFFERING });
    Plugins.interface.onBuffering(evt);
  }

  function bubbleBufferingCleared() {
    const evt = new PluginData({
      status: PluginEnums.STATUS.DISMISSED,
      stateType: PluginEnums.TYPE.BUFFERING,
      isInitialPlay,
    });
    Plugins.interface.onBufferingCleared(evt);
  }

  function bubbleFatalError(bufferingTimeoutError, mediaError) {
    const evt = new PluginData({
      status: PluginEnums.STATUS.FATAL,
      stateType: PluginEnums.TYPE.ERROR,
      isBufferingTimeoutError: bufferingTimeoutError,
      code: mediaError.code,
      message: mediaError.message,
    });
    Plugins.interface.onFatalError(evt);
    publishMediaStateUpdate(MediaState.FATAL_ERROR, {
      isBufferingTimeoutError: bufferingTimeoutError,
      code: mediaError.code,
      message: mediaError.message,
    });
  }

  function publishMediaStateUpdate(state, opts) {
    const stateUpdateData = {
      data: {
        currentTime: getCurrentTime(),
        seekableRange: getSeekableRange(),
        state,
        duration: getDuration(),
      },
      timeUpdate: opts && opts.timeUpdate,
      isBufferingTimeoutError: (opts && opts.isBufferingTimeoutError) || false,
    };

    if (opts && opts.code > -1 && opts.message) {
      stateUpdateData.code = opts.code;
      stateUpdateData.message = opts.message;
    }

    // guard against attempting to call _stateUpdateCallback after a tearDown
    // can happen if tearing down whilst an async cdn failover is being attempted
    if (_stateUpdateCallback) {
      _stateUpdateCallback(stateUpdateData);
    }
  }

  function loadMedia(type, startTime, thenPause) {
    playbackStrategy && playbackStrategy.load(type, startTime);
    if (thenPause) {
      pause();
    }
  }

  function tearDown() {
    tearDownMediaElement();
    playbackStrategy && playbackStrategy.tearDown();
    playbackStrategy = null;
    isInitialPlay = true;
    errorTimeoutID = undefined;
    _windowType = undefined;
    mediaKind = undefined;
    _stateUpdateCallback = undefined;
    mediaMetaData = undefined;
    fatalErrorTimeout = undefined;
    fatalError = undefined;
  }

  return {
    play,
    pause,
    setSubtitles,
    transitions,
    isEnded,
    setPlaybackRate,
    getPlaybackRate,
    setCurrentTime,
    getCurrentTime,
    getDuration,
    getWindowStartTime,
    getWindowEndTime,
    getSeekableRange,
    getPlayerElement,
    isPaused,
    tearDown,
  }
}

function getLiveSupport$1() {
  return (window.bigscreenPlayer && window.bigscreenPlayer.liveSupport) || LiveSupport.SEEKABLE
}

PlayerComponent.getLiveSupport = getLiveSupport$1;

const PauseTriggers = {
    USER: 1,
    APP: 2,
    DEVICE: 3,
};

var Version = "8.6.0";

var sourceList;
var source;
var cdn;

var timeUpdateCallbacks = [];
var subtitleCallbacks = [];
var stateChangeCallbacks = [];

var currentTime;
var isSeeking;
var seekableRange;
var duration;
var liveWindowStart;
var pausedState = true;
var endedState;
var mediaKind;
var windowType;
var subtitlesAvailable;
var subtitlesEnabled;
var subtitlesHidden;
var endOfStream;
var canSeekState;
var canPauseState;
var shallowClone;
var mockModes = {
  NONE: 0,
  PLAIN: 1,
  JASMINE: 2,
};
var mockStatus = { currentlyMocked: false, mode: mockModes.NONE };
var initialised;
var fatalErrorBufferingTimeout;

var autoProgress;
var autoProgressInterval;
var initialBuffering = false;

var liveWindowData;
var manifestError;

var excludedFuncs = [
  "getDebugLogs",
  "mock",
  "mockJasmine",
  "unmock",
  "toggleDebug",
  "getLogLevels",
  "setLogLevel",
  "convertEpochMsToVideoTimeSeconds",
  "clearSubtitleExample",
  "areSubtitlesCustomisable",
  "setPlaybackRate",
  "getPlaybackRate",
];

function startProgress(progressCause) {
  setTimeout(function () {
    if (!autoProgressInterval) {
      mockingHooks.changeState(MediaState.PLAYING, progressCause);
      autoProgressInterval = setInterval(function () {
        if (windowType !== WindowTypes.STATIC && seekableRange.start && seekableRange.end) {
          seekableRange.start += 0.5;
          seekableRange.end += 0.5;
        }
        mockingHooks.progressTime(currentTime + 0.5);
        if (currentTime >= duration) {
          clearInterval(autoProgressInterval);
          mockingHooks.changeState(MediaState.ENDED);
        }
      }, 500);
    }
  }, 100);
}

function stopProgress() {
  if (autoProgressInterval) {
    clearInterval(autoProgressInterval);
    autoProgressInterval = null;
  }
}

function mock(BigscreenPlayer, opts) {
  autoProgress = opts && opts.autoProgress;

  if (opts && opts.excludedFuncs) {
    excludedFuncs = excludedFuncs.concat(opts.excludedFuncs);
  }

  if (mockStatus.currentlyMocked) {
    throw new Error("mock() was called while BigscreenPlayer was already mocked")
  }
  shallowClone = Utils.clone(BigscreenPlayer);

  // Divert existing functions
  for (var func in BigscreenPlayer) {
    if (BigscreenPlayer[func] && mockFunctions[func]) {
      BigscreenPlayer[func] = mockFunctions[func];
    } else if (!Utils.contains(excludedFuncs, func)) {
      throw new Error(func + " was not mocked or included in the exclusion list")
    }
  }
  // Add extra functions
  for (var hook in mockingHooks) {
    BigscreenPlayer[hook] = mockingHooks[hook];
  }
  mockStatus = { currentlyMocked: true, mode: mockModes.PLAIN };
}

function mockJasmine(BigscreenPlayer, opts) {
  autoProgress = opts && opts.autoProgress;

  if (opts && opts.excludedFuncs) {
    excludedFuncs = excludedFuncs.concat(opts.excludedFuncs);
  }

  if (mockStatus.currentlyMocked) {
    throw new Error("mockJasmine() was called while BigscreenPlayer was already mocked")
  }

  for (var fn in BigscreenPlayer) {
    if (BigscreenPlayer[fn] && mockFunctions[fn]) {
      // eslint-disable-next-line no-undef
      spyOn(BigscreenPlayer, fn).and.callFake(mockFunctions[fn]);
    } else if (!Utils.contains(excludedFuncs, fn)) {
      throw new Error(fn + " was not mocked or included in the exclusion list")
    }
  }

  for (var hook in mockingHooks) {
    BigscreenPlayer[hook] = mockingHooks[hook];
  }
  mockStatus = { currentlyMocked: true, mode: mockModes.JASMINE };
}

function unmock(BigscreenPlayer) {
  if (!mockStatus.currentlyMocked) {
    throw new Error("unmock() was called before BigscreenPlayer was mocked")
  }

  // Remove extra functions
  for (var hook in mockingHooks) {
    delete BigscreenPlayer[hook];
  }
  // Undo divert existing functions (plain mock only)
  if (mockStatus.mode === mockModes.PLAIN) {
    for (var func in shallowClone) {
      BigscreenPlayer[func] = shallowClone[func];
    }
  }

  timeUpdateCallbacks = [];
  stateChangeCallbacks = [];

  mockStatus = { currentlyMocked: false, mode: mockModes.NONE };
}

function callSubtitlesCallbacks(enabled) {
  CallCallbacks(subtitleCallbacks, { enabled: enabled });
}

var mockFunctions = {
  init: function (playbackElement, bigscreenPlayerData, newWindowType, enableSubtitles, callbacks) {
    currentTime = (bigscreenPlayerData && bigscreenPlayerData.initialPlaybackTime) || 0;
    liveWindowStart = undefined;
    pausedState = true;
    endedState = false;
    mediaKind = (bigscreenPlayerData && bigscreenPlayerData.media && bigscreenPlayerData.media.kind) || "video";
    windowType = newWindowType || WindowTypes.STATIC;
    subtitlesAvailable = true;
    subtitlesEnabled = enableSubtitles;
    canSeekState = true;
    canPauseState = true;
    sourceList = bigscreenPlayerData && bigscreenPlayerData.media && bigscreenPlayerData.media.urls;
    source = sourceList && sourceList[0].url;
    cdn = sourceList && sourceList[0].cdn;

    duration = windowType === WindowTypes.STATIC ? 4808 : Infinity;
    seekableRange = { start: 0, end: 4808 };

    if (manifestError) {
      if (callbacks && callbacks.onError) {
        callbacks.onError({ error: "manifest" });
      }
      return
    }

    mockingHooks.changeState(MediaState.WAITING);

    if (autoProgress && !initialBuffering) {
      startProgress();
    }

    initialised = true;

    if (enableSubtitles) {
      callSubtitlesCallbacks(true);
    }

    if (callbacks && callbacks.onSuccess) {
      callbacks.onSuccess();
    }
  },
  registerForTimeUpdates: function (callback) {
    timeUpdateCallbacks.push(callback);
    return callback
  },
  unregisterForTimeUpdates: function (callback) {
    timeUpdateCallbacks = timeUpdateCallbacks.filter(function (existingCallback) {
      return callback !== existingCallback
    });
  },
  registerForSubtitleChanges: function (callback) {
    subtitleCallbacks.push(callback);
    return callback
  },
  unregisterForSubtitleChanges: function (callback) {
    subtitleCallbacks = subtitleCallbacks.filter(function (existingCallback) {
      return callback !== existingCallback
    });
  },
  registerForStateChanges: function (callback) {
    stateChangeCallbacks.push(callback);
    return callback
  },
  unregisterForStateChanges: function (callback) {
    stateChangeCallbacks = stateChangeCallbacks.filter(function (existingCallback) {
      return callback !== existingCallback
    });
  },
  setCurrentTime: function (time) {
    currentTime = time;
    isSeeking = true;
    if (autoProgress) {
      mockingHooks.changeState(MediaState.WAITING, "other");
      if (!pausedState) {
        startProgress();
      }
    } else {
      mockingHooks.progressTime(currentTime);
    }
  },
  getCurrentTime: function () {
    return currentTime
  },
  getMediaKind: function () {
    return mediaKind
  },
  getWindowType: function () {
    return windowType
  },
  getSeekableRange: function () {
    return seekableRange
  },
  getDuration: function () {
    return duration
  },
  isPaused: function () {
    return pausedState
  },
  isEnded: function () {
    return endedState
  },
  play: function () {
    if (autoProgress) {
      startProgress("other");
    } else {
      mockingHooks.changeState(MediaState.PLAYING, "other");
    }
  },
  pause: function (opts) {
    mockingHooks.changeState(MediaState.PAUSED, "other", opts);
  },
  setSubtitlesEnabled: function (value) {
    subtitlesEnabled = value;
    callSubtitlesCallbacks(value);
  },
  isSubtitlesEnabled: function () {
    return subtitlesEnabled
  },
  isSubtitlesAvailable: function () {
    return subtitlesAvailable
  },
  customiseSubtitles: function () {},
  renderSubtitleExample: function () {},
  setTransportControlsPosition: function (position) {},
  canSeek: function () {
    return canSeekState
  },
  canPause: function () {
    return canPauseState
  },
  convertVideoTimeSecondsToEpochMs: function (seconds) {
    return liveWindowStart ? liveWindowStart + seconds * 1000 : undefined
  },
  transitions: function () {
    return {
      canBePaused: function () {
        return true
      },
      canBeginSeek: function () {
        return true
      },
    }
  },
  isPlayingAtLiveEdge: function () {
    return false
  },
  resize: function () {
    subtitlesHidden = this.isSubtitlesEnabled();
    this.setSubtitlesEnabled(subtitlesHidden);
  },
  clearResize: function () {
    this.setSubtitlesEnabled(subtitlesHidden);
  },
  getPlayerElement: function () {
    return
  },
  getFrameworkVersion: function () {
    return Version
  },
  tearDown: function () {
    manifestError = false;
    if (!initialised) {
      return
    }

    Plugins.interface.onBufferingCleared(
      new PluginData({
        status: PluginEnums.STATUS.DISMISSED,
        stateType: PluginEnums.TYPE.BUFFERING,
        isInitialPlay: initialBuffering,
      })
    );
    Plugins.interface.onErrorCleared(
      new PluginData({ status: PluginEnums.STATUS.DISMISSED, stateType: PluginEnums.TYPE.ERROR })
    );
    Plugins.unregisterPlugin();

    timeUpdateCallbacks = [];
    stateChangeCallbacks = [];

    if (autoProgress) {
      stopProgress();
    }

    initialised = false;
  },
  registerPlugin: function (plugin) {
    Plugins.registerPlugin(plugin);
  },
  unregisterPlugin: function (plugin) {
    Plugins.unregisterPlugin(plugin);
  },
  getLiveWindowData: function () {
    if (windowType === WindowTypes.STATIC) {
      return {}
    }
    return {
      windowStartTime: liveWindowData.windowStartTime,
      windowEndTime: liveWindowData.windowEndTime,
      initialPlaybackTime: liveWindowData.initialPlaybackTime,
      serverDate: liveWindowData.serverDate,
    }
  },
};

var mockingHooks = {
  changeState: function (state, eventTrigger, opts) {
    var pauseTrigger = opts && opts.userPause === false ? PauseTriggers.APP : PauseTriggers.USER;

    pausedState = state === MediaState.PAUSED || state === MediaState.STOPPED || state === MediaState.ENDED;
    endedState = state === MediaState.ENDED;

    if (state === MediaState.WAITING) {
      fatalErrorBufferingTimeout = true;
      Plugins.interface.onBuffering(
        new PluginData({ status: PluginEnums.STATUS.STARTED, stateType: PluginEnums.TYPE.BUFFERING })
      );
    } else {
      Plugins.interface.onBufferingCleared(
        new PluginData({
          status: PluginEnums.STATUS.DISMISSED,
          stateType: PluginEnums.TYPE.BUFFERING,
          isInitialPlay: initialBuffering,
        })
      );
    }
    Plugins.interface.onErrorCleared(
      new PluginData({ status: PluginEnums.STATUS.DISMISSED, stateType: PluginEnums.TYPE.ERROR })
    );

    if (state === MediaState.FATAL_ERROR) {
      Plugins.interface.onFatalError(
        new PluginData({
          status: PluginEnums.STATUS.FATAL,
          stateType: PluginEnums.TYPE.ERROR,
          isBufferingTimeoutError: fatalErrorBufferingTimeout,
        })
      );
    }

    var stateObject = { state: state };
    if (state === MediaState.PAUSED) {
      stateObject.trigger = pauseTrigger;
      endOfStream = false;
    }
    if (state === MediaState.FATAL_ERROR) {
      stateObject.errorId = opts && opts.error;
      stateObject.isBufferingTimeoutError = opts && opts.isBufferingTimeoutError;
    }
    if (state === MediaState.WAITING) {
      stateObject.isSeeking = isSeeking;
      isSeeking = false;
    }
    stateObject.endOfStream = endOfStream;

    CallCallbacks(stateChangeCallbacks, stateObject);

    if (autoProgress) {
      if (state !== MediaState.PLAYING) {
        stopProgress();
      } else {
        startProgress();
      }
    }
  },
  progressTime: function (time) {
    currentTime = time;
    CallCallbacks(timeUpdateCallbacks, {
      currentTime: time,
      endOfStream: endOfStream,
    });
  },
  setEndOfStream: function (isEndOfStream) {
    endOfStream = isEndOfStream;
  },
  setDuration: function (mediaDuration) {
    duration = mediaDuration;
  },
  setSeekableRange: function (newSeekableRange) {
    seekableRange = newSeekableRange;
  },
  setMediaKind: function (kind) {
    mediaKind = kind;
  },
  setWindowType: function (type) {
    windowType = type;
  },
  setCanSeek: function (value) {
    canSeekState = value;
  },
  setCanPause: function (value) {
    canPauseState = value;
  },
  setLiveWindowStart: function (value) {
    liveWindowStart = value;
  },
  setSubtitlesAvailable: function (value) {
    subtitlesAvailable = value;
  },
  getSource: function () {
    return source
  },
  triggerError: function () {
    fatalErrorBufferingTimeout = false;
    Plugins.interface.onError(
      new PluginData({
        status: PluginEnums.STATUS.STARTED,
        stateType: PluginEnums.TYPE.ERROR,
        isBufferingTimeoutError: false,
      })
    );
    this.changeState(MediaState.WAITING);
    stopProgress();
  },
  triggerManifestError: function () {
    manifestError = true;
  },
  triggerErrorHandled: function () {
    if (sourceList && sourceList.length > 1) {
      sourceList.shift();
      source = sourceList[0].url;
      cdn = sourceList[0].cdn;
    }
    Plugins.interface.onBufferingCleared(
      new PluginData({
        status: PluginEnums.STATUS.DISMISSED,
        stateType: PluginEnums.TYPE.BUFFERING,
        isInitialPlay: initialBuffering,
      })
    );
    Plugins.interface.onErrorCleared(
      new PluginData({ status: PluginEnums.STATUS.DISMISSED, stateType: PluginEnums.TYPE.ERROR })
    );
    Plugins.interface.onErrorHandled(
      new PluginData({
        status: PluginEnums.STATUS.FAILOVER,
        stateType: PluginEnums.TYPE.ERROR,
        isBufferingTimeoutError: fatalErrorBufferingTimeout,
        cdn: cdn,
      })
    );

    if (autoProgress) {
      stopProgress();
      startProgress();
    }
  },
  setInitialBuffering: function (value) {
    initialBuffering = value;
  },
  setLiveWindowData: function (newLiveWindowData) {
    liveWindowData = newLiveWindowData;
  },
};

var MockBigscreenPlayer = {
  mock: mock,
  unmock: unmock,
  mockJasmine: mockJasmine,
};

function durationToSeconds(duration) {
    const matches = duration.match(/^PT(\d+(?:[,.]\d+)?H)?(\d+(?:[,.]\d+)?M)?(\d+(?:[,.]\d+)?S)?/) || [];
    const hours = parseFloat(matches[1] || "0") * 60 * 60;
    const mins = parseFloat(matches[2] || "0") * 60;
    const secs = parseFloat(matches[3] || "0");
    return hours + mins + secs || undefined;
}
function convertToSeekableVideoTime(epochTime, windowStartEpochTime) {
    // Wont allow a 0 value for this due to device issue, this should be sorted in the TAL strategy.
    return Math.max(0.1, convertToVideoTime(epochTime, windowStartEpochTime));
}
function convertToVideoTime(epochTime, windowStartEpochTime) {
    return Math.floor(convertMilliSecondsToSeconds(epochTime - windowStartEpochTime));
}
function convertMilliSecondsToSeconds(timeInMilis) {
    return Math.floor(timeInMilis / 1000);
}
function calculateSlidingWindowSeekOffset(time, dvrInfoRangeStart, timeCorrection, slidingWindowPausedTime) {
    const dashRelativeTime = time + timeCorrection - dvrInfoRangeStart;
    if (slidingWindowPausedTime === 0) {
        return dashRelativeTime;
    }
    return dashRelativeTime - (Date.now() - slidingWindowPausedTime) / 1000;
}
var TimeUtils = {
    durationToSeconds,
    convertToSeekableVideoTime,
    convertToVideoTime,
    calculateSlidingWindowSeekOffset,
};

function LoadUrl(url, opts) {
    const xhr = new XMLHttpRequest();
    if (opts.timeout) {
        xhr.timeout = opts.timeout;
    }
    if (opts.onTimeout) {
        xhr.ontimeout = opts.onTimeout;
    }
    xhr.addEventListener("readystatechange", function listener() {
        if (xhr.readyState === 4) {
            xhr.removeEventListener("readystatechange", listener);
            if (xhr.status >= 200 && xhr.status < 300) {
                if (opts.onLoad) {
                    opts.onLoad(xhr.responseXML, xhr.responseText, xhr.status);
                }
            }
            else {
                if (opts.onError) {
                    opts.onError({ errorType: "NON_200_ERROR", statusCode: xhr.status });
                }
            }
        }
    });
    try {
        xhr.open(opts.method || "GET", url, true);
        if (opts.headers) {
            for (const header in opts.headers) {
                if (opts.headers.hasOwnProperty(header)) {
                    xhr.setRequestHeader(header, opts.headers[header]);
                }
            }
        }
        xhr.send(opts.data || null);
    }
    catch ({ name }) {
        if (opts.onError) {
            opts.onError({ errorType: name, statusCode: xhr.status });
        }
    }
}

const parsingStrategyByManifestType = {
  mpd: parseMPD,
  m3u8: parseM3U8,
};

const placeholders = {
  windowStartTime: NaN,
  windowEndTime: NaN,
  presentationTimeOffsetSeconds: NaN,
  timeCorrectionSeconds: NaN,
};

const dashParsingStrategyByWindowType = {
  [WindowTypes.GROWING]: parseGrowingMPD,
  [WindowTypes.SLIDING]: parseSlidingMPD,
  [WindowTypes.STATIC]: parseStaticMPD,
};

function parseMPD(manifestEl, { windowType, initialWallclockTime } = {}) {
  return new Promise((resolve) => {
    const mpd = manifestEl.querySelector("MPD");

    const parse = dashParsingStrategyByWindowType[windowType];

    if (parse == null) {
      throw new Error(`Could not find a DASH parsing strategy for window type ${windowType}`)
    }

    return resolve(parse(mpd, initialWallclockTime))
  }).catch((error) => {
    const errorWithCode = new Error(error.message ?? "manifest-dash-parse-error");
    errorWithCode.code = PluginEnums.ERROR_CODES.MANIFEST_PARSE;
    throw errorWithCode
  })
}

function fetchWallclockTime(mpd, initialWallclockTime) {
  // TODO: `serverDate`/`initialWallClockTime` is deprecated. Remove this.
  // [tag:ServerDate]
  if (initialWallclockTime) {
    // console.warn("Deprecated")
    return Promise.resolve(initialWallclockTime)
  }

  return new Promise((resolveFetch, rejectFetch) => {
    const timingResource = mpd.querySelector("UTCTiming")?.getAttribute("value");

    if (!timingResource || typeof timingResource !== "string") {
      throw new TypeError("manifest-dash-timing-error")
    }

    LoadUrl(timingResource, {
      onLoad: (_, utcTimeString) => resolveFetch(Date.parse(utcTimeString)),
      onError: () => rejectFetch(new Error("manifest-dash-timing-error")),
    });
  })
}

function getSegmentTemplate(mpd) {
  // Can be either audio or video data.
  // It doesn't matter as we use the factor of x/timescale. This is the same for both.
  const segmentTemplate = mpd.querySelector("SegmentTemplate");

  return {
    duration: parseFloat(segmentTemplate.getAttribute("duration")),
    timescale: parseFloat(segmentTemplate.getAttribute("timescale")),
    presentationTimeOffset: parseFloat(segmentTemplate.getAttribute("presentationTimeOffset")),
  }
}

function parseStaticMPD(mpd) {
  return new Promise((resolveParse) => {
    const { presentationTimeOffset, timescale } = getSegmentTemplate(mpd);

    return resolveParse({
      presentationTimeOffsetSeconds: presentationTimeOffset / timescale,
    })
  })
}

function parseSlidingMPD(mpd, initialWallclockTime) {
  return fetchWallclockTime(mpd, initialWallclockTime).then((wallclockTime) => {
    const { duration, timescale } = getSegmentTemplate(mpd);
    const availabilityStartTime = mpd.getAttribute("availabilityStartTime");
    const segmentLengthMillis = (1000 * duration) / timescale;

    if (!availabilityStartTime || !segmentLengthMillis) {
      throw new Error("manifest-dash-attributes-parse-error")
    }

    const timeShiftBufferDepthMillis = 1000 * TimeUtils.durationToSeconds(mpd.getAttribute("timeShiftBufferDepth"));
    const windowEndTime = wallclockTime - Date.parse(availabilityStartTime) - segmentLengthMillis;
    const windowStartTime = windowEndTime - timeShiftBufferDepthMillis;

    return {
      windowStartTime,
      windowEndTime,
      timeCorrectionSeconds: windowStartTime / 1000,
    }
  })
}

function parseGrowingMPD(mpd, initialWallclockTime) {
  return fetchWallclockTime(mpd, initialWallclockTime).then((wallclockTime) => {
    const { duration, timescale } = getSegmentTemplate(mpd);
    const availabilityStartTime = mpd.getAttribute("availabilityStartTime");
    const segmentLengthMillis = (1000 * duration) / timescale;

    if (!availabilityStartTime || !segmentLengthMillis) {
      throw new Error("manifest-dash-attributes-parse-error")
    }

    return {
      windowStartTime: Date.parse(availabilityStartTime),
      windowEndTime: wallclockTime - segmentLengthMillis,
    }
  })
}

function parseM3U8(manifest, { windowType } = {}) {
  return new Promise((resolve) => {
    const programDateTime = getM3U8ProgramDateTime(manifest);
    const duration = getM3U8WindowSizeInSeconds(manifest);

    if (!(programDateTime && duration)) {
      throw new Error("manifest-hls-attributes-parse-error")
    }

    if (windowType === WindowTypes.STATIC) {
      return resolve({
        presentationTimeOffsetSeconds: programDateTime / 1000,
      })
    }

    return resolve({
      windowStartTime: programDateTime,
      windowEndTime: programDateTime + duration * 1000,
    })
  }).catch((error) => {
    const errorWithCode = new Error(error.message || "manifest-hls-parse-error");
    errorWithCode.code = PluginEnums.ERROR_CODES.MANIFEST_PARSE;
    throw errorWithCode
  })
}

function getM3U8ProgramDateTime(data) {
  const match = /^#EXT-X-PROGRAM-DATE-TIME:(.*)$/m.exec(data);

  if (match) {
    const parsedDate = Date.parse(match[1]);

    if (!isNaN(parsedDate)) {
      return parsedDate
    }
  }
}

function getM3U8WindowSizeInSeconds(data) {
  const regex = /#EXTINF:(\d+(?:\.\d+)?)/g;
  let matches = regex.exec(data);
  let result = 0;

  while (matches) {
    result += +matches[1];
    matches = regex.exec(data);
  }

  return Math.floor(result)
}

function parse(manifest, { type, windowType, initialWallclockTime } = {}) {
  const parseManifest = parsingStrategyByManifestType[type];

  return parseManifest(manifest, { windowType, initialWallclockTime })
    .then((values) => ({ ...placeholders, ...values }))
    .catch((error) => {
      DebugToolInstance.error(error);
      Plugins.interface.onManifestParseError({ code: error.code, message: error.message });

      return { ...placeholders }
    })
}

var ManifestParser = {
  parse,
};

function retrieveDashManifest(url, { windowType, initialWallclockTime } = {}) {
  return new Promise((resolveLoad, rejectLoad) =>
    LoadUrl(url, {
      method: "GET",
      headers: {},
      timeout: 10000,
      onLoad: (responseXML) => resolveLoad(responseXML),
      onError: () => rejectLoad(new Error("Network error: Unable to retrieve DASH manifest")),
    })
  )
    .then((xml) => {
      if (xml == null) {
        throw new TypeError("Unable to retrieve DASH XML response")
      }

      return ManifestParser.parse(xml, { initialWallclockTime, windowType, type: "mpd" })
    })
    .then((time) => ({ time, transferFormat: TransferFormat.DASH }))
    .catch((error) => {
      if (error.message.indexOf("DASH") !== -1) {
        throw error
      }

      throw new Error("Unable to retrieve DASH XML response")
    })
}

function retrieveHLSManifest(url, { windowType } = {}) {
  return new Promise((resolveLoad, rejectLoad) =>
    LoadUrl(url, {
      method: "GET",
      headers: {},
      timeout: 10000,
      onLoad: (_, responseText) => resolveLoad(responseText),
      onError: () => rejectLoad(new Error("Network error: Unable to retrieve HLS master playlist")),
    })
  ).then((text) => {
    if (!text || typeof text !== "string") {
      throw new TypeError("Unable to retrieve HLS master playlist")
    }

    let streamUrl = getStreamUrl(text);

    if (!streamUrl || typeof streamUrl !== "string") {
      throw new TypeError("Unable to retrieve playlist url from HLS master playlist")
    }

    if (streamUrl.indexOf("http") !== 0) {
      const parts = url.split("/");

      parts.pop();
      parts.push(streamUrl);
      streamUrl = parts.join("/");
    }

    return retrieveHLSLivePlaylist(streamUrl, { windowType })
  })
}

function retrieveHLSLivePlaylist(url, { windowType } = {}) {
  return new Promise((resolveLoad, rejectLoad) =>
    LoadUrl(url, {
      method: "GET",
      headers: {},
      timeout: 10000,
      onLoad: (_, responseText) => resolveLoad(responseText),
      onError: () => rejectLoad(new Error("Network error: Unable to retrieve HLS live playlist")),
    })
  )
    .then((text) => {
      if (!text || typeof text !== "string") {
        throw new TypeError("Unable to retrieve HLS live playlist")
      }

      return ManifestParser.parse(text, { windowType, type: "m3u8" })
    })
    .then((time) => ({ time, transferFormat: TransferFormat.HLS }))
}

function getStreamUrl(data) {
  const match = /#EXT-X-STREAM-INF:.*[\n\r]+(.*)[\n\r]?/.exec(data);

  if (match) {
    return match[1]
  }
}

var ManifestLoader = {
  load: (mediaUrl, { windowType, initialWallclockTime } = {}) => {
    if (/\.mpd(\?.*)?$/.test(mediaUrl)) {
      return retrieveDashManifest(mediaUrl, { windowType, initialWallclockTime })
    }

    if (/\.m3u8(\?.*)?$/.test(mediaUrl)) {
      return retrieveHLSManifest(mediaUrl, { windowType, initialWallclockTime })
    }

    return Promise.reject(new Error("Invalid media url"))
  },
};

const SEGMENT_TEMPLATE_MATCHER = /\$[A-Za-z]+\$/g;
function findSegmentTemplate(url) {
    const matches = url.match(SEGMENT_TEMPLATE_MATCHER);
    if (matches == null) {
        return null;
    }
    return matches[matches.length - 1];
}

function MediaSources() {
  let mediaSources;
  let failedOverSources = [];
  let failoverResetTokens = [];
  let windowType;
  let liveSupport;
  let initialWallclockTime;
  let time = {};
  let transferFormat;
  let subtitlesSources;
  // Default 5000 can be overridden with media.subtitlesRequestTimeout
  let subtitlesRequestTimeout = 5000;
  let failoverResetTimeMs = 120000;
  let failoverSort;

  function init(media, newServerDate, newWindowType, newLiveSupport, callbacks) {
    if (!media.urls?.length) {
      throw new Error("Media Sources urls are undefined")
    }

    if (callbacks?.onSuccess == null || callbacks?.onError == null) {
      throw new Error("Media Sources callbacks are undefined")
    }

    if (media.subtitlesRequestTimeout) {
      subtitlesRequestTimeout = media.subtitlesRequestTimeout;
    }

    if (media.playerSettings?.failoverResetTime) {
      failoverResetTimeMs = media.playerSettings.failoverResetTime;
    }

    if (media.playerSettings?.failoverSort) {
      failoverSort = media.playerSettings.failoverSort;
    }

    windowType = newWindowType;
    liveSupport = newLiveSupport;
    initialWallclockTime = newServerDate;
    mediaSources = media.urls ? Utils.cloneArray(media.urls) : [];
    subtitlesSources = media.captions ? Utils.cloneArray(media.captions) : [];

    updateDebugOutput();

    if (!needToGetManifest(windowType, liveSupport)) {
      callbacks.onSuccess();
      return
    }

    loadManifest(callbacks, { initialWallclockTime, windowType });
  }

  function failover(onFailoverSuccess, onFailoverError, failoverParams) {
    if (shouldFailover(failoverParams)) {
      emitCdnFailover(failoverParams);
      updateCdns(failoverParams.serviceLocation);
      updateDebugOutput();

      if (needToGetManifest(windowType, liveSupport)) {
        loadManifest({ onSuccess: onFailoverSuccess, onError: onFailoverError }, { windowType });
      } else {
        onFailoverSuccess();
      }
    } else {
      onFailoverError();
    }
  }

  function failoverSubtitles(postFailoverAction, failoverErrorAction, { statusCode, ...rest } = {}) {
    if (subtitlesSources.length > 1) {
      Plugins.interface.onSubtitlesLoadError({
        status: statusCode,
        severity: PluginEnums.STATUS.FAILOVER,
        cdn: getCurrentSubtitlesCdn(),
        subtitlesSources: subtitlesSources.length,
        ...rest,
      });
      subtitlesSources.shift();
      updateDebugOutput();
      if (postFailoverAction) {
        postFailoverAction();
      }
    } else {
      Plugins.interface.onSubtitlesLoadError({
        status: statusCode,
        severity: PluginEnums.STATUS.FATAL,
        cdn: getCurrentSubtitlesCdn(),
        subtitlesSources: subtitlesSources.length,
        ...rest,
      });
      if (failoverErrorAction) {
        failoverErrorAction();
      }
    }
  }

  function shouldFailover(failoverParams) {
    if (isFirstManifest(failoverParams.serviceLocation)) {
      return false
    }
    const aboutToEnd = failoverParams.duration && failoverParams.currentTime > failoverParams.duration - 5;
    const shouldStaticFailover = windowType === WindowTypes.STATIC && !aboutToEnd;
    const shouldLiveFailover = windowType !== WindowTypes.STATIC;
    return (
      isFailoverInfoValid(failoverParams) && hasSourcesToFailoverTo() && (shouldStaticFailover || shouldLiveFailover)
    )
  }

  function stripQueryParamsAndHash(url) {
    return typeof url === "string" ? url.split(/[#?]/)[0] : url
  }

  // we don't want to failover on the first playback
  // the serviceLocation is set to our first cdn url
  // see manifest modifier - generateBaseUrls
  function isFirstManifest(serviceLocation) {
    return doHostsMatch(serviceLocation, getCurrentUrl())
  }

  function doHostsMatch(firstUrl, secondUrl) {
    // Matches anything between *:// and / or the end of the line
    const hostRegex = /\w+?:\/\/(.*?)(?:\/|$)/;

    const serviceLocNoQueryHash = stripQueryParamsAndHash(firstUrl);
    const currUrlNoQueryHash = stripQueryParamsAndHash(secondUrl);

    const serviceLocationHost = hostRegex.exec(serviceLocNoQueryHash);
    const currentUrlHost = hostRegex.exec(currUrlNoQueryHash);

    return serviceLocationHost && currentUrlHost
      ? serviceLocationHost[1] === currentUrlHost[1]
      : serviceLocNoQueryHash === currUrlNoQueryHash
  }

  function isFailoverInfoValid(failoverParams) {
    const infoValid = typeof failoverParams === "object" && typeof failoverParams.isBufferingTimeoutError === "boolean";

    if (!infoValid) {
      DebugToolInstance.error("failoverInfo is not valid");
    }

    return infoValid
  }

  function failoverResetTime() {
    return failoverResetTimeMs
  }

  function hasSegmentedSubtitles() {
    const url = getCurrentSubtitlesUrl();

    if (typeof url !== "string" || url === "") {
      return false
    }

    return findSegmentTemplate(url) != null
  }

  function needToGetManifest(windowType, liveSupport) {
    const isStartTimeAccurate = {
      restartable: true,
      seekable: true,
      playable: false,
      none: false,
    };

    const hasManifestBeenLoaded = transferFormat !== undefined;

    return (
      (!hasManifestBeenLoaded || transferFormat === TransferFormat.HLS) &&
      (windowType !== WindowTypes.STATIC || hasSegmentedSubtitles()) &&
      isStartTimeAccurate[liveSupport]
    )
  }

  function refresh(onSuccess, onError) {
    loadManifest({ onSuccess, onError }, { windowType });
  }

  // [tag:ServerDate]
  function loadManifest(callbacks, { initialWallclockTime, windowType } = {}) {
    return ManifestLoader.load(getCurrentUrl(), { initialWallclockTime, windowType })
      .then(({ time: newTime, transferFormat: newTransferFormat } = {}) => {
        time = newTime;
        transferFormat = newTransferFormat;

        logManifestLoaded(transferFormat, time);
        callbacks.onSuccess();
      })
      .catch((error) => {
        DebugToolInstance.error(`Failed to load manifest: ${error?.message ?? "cause n/a"}`);

        failover(
          () => callbacks.onSuccess(),
          () => callbacks.onError({ error: "manifest" }),
          {
            isBufferingTimeoutError: false,
            code: PluginEnums.ERROR_CODES.MANIFEST_LOAD,
            message: PluginEnums.ERROR_MESSAGES.MANIFEST,
          }
        );
      })
  }

  function getCurrentUrl() {
    if (mediaSources.length > 0) {
      return mediaSources[0].url.toString()
    }

    return ""
  }

  function getCurrentSubtitlesUrl() {
    if (subtitlesSources.length > 0) {
      return subtitlesSources[0].url.toString()
    }

    return ""
  }

  function getCurrentSubtitlesSegmentLength() {
    if (subtitlesSources.length > 0) {
      return subtitlesSources[0].segmentLength
    }
  }

  function getSubtitlesRequestTimeout() {
    return subtitlesRequestTimeout
  }

  function getCurrentSubtitlesCdn() {
    if (subtitlesSources.length > 0) {
      return subtitlesSources[0].cdn
    }
  }

  function availableUrls() {
    return mediaSources.map((mediaSource) => mediaSource.url)
  }

  function generateTime() {
    return time
  }

  function updateFailedOverSources(mediaSource) {
    failedOverSources.push(mediaSource);

    if (failoverSort) {
      mediaSources = failoverSort(mediaSources);
    }

    const failoverResetToken = setTimeout(() => {
      if (mediaSources?.length > 0 && failedOverSources?.length > 0) {
        DebugToolInstance.info(`${mediaSource.cdn} has been added back in to available CDNs`);
        mediaSources.push(failedOverSources.shift());
        updateDebugOutput();
      }
    }, failoverResetTimeMs);

    failoverResetTokens.push(failoverResetToken);
  }

  function updateCdns(serviceLocation) {
    if (hasSourcesToFailoverTo()) {
      updateFailedOverSources(mediaSources.shift());
      moveMediaSourceToFront(serviceLocation);
    }
  }

  function moveMediaSourceToFront(serviceLocation) {
    if (serviceLocation) {
      let serviceLocationIdx = mediaSources
        .map((mediaSource) => stripQueryParamsAndHash(mediaSource.url))
        .indexOf(stripQueryParamsAndHash(serviceLocation));

      if (serviceLocationIdx < 0) serviceLocationIdx = 0;

      mediaSources.unshift(mediaSources.splice(serviceLocationIdx, 1)[0]);
    }
  }

  function hasSourcesToFailoverTo() {
    return mediaSources.length > 1
  }

  function emitCdnFailover(failoverInfo) {
    const evt = new PluginData({
      status: PluginEnums.STATUS.FAILOVER,
      stateType: PluginEnums.TYPE.ERROR,
      isBufferingTimeoutError: failoverInfo.isBufferingTimeoutError,
      cdn: mediaSources[0].cdn,
      newCdn: mediaSources[1].cdn,
      code: failoverInfo.code,
      message: failoverInfo.message,
    });
    Plugins.interface.onErrorHandled(evt);
  }

  function availableCdns() {
    return mediaSources.map((mediaSource) => mediaSource.cdn)
  }

  function availableSubtitlesCdns() {
    return subtitlesSources.map((subtitleSource) => subtitleSource.cdn)
  }

  function logManifestLoaded(transferFormat, time) {
    let logMessage = `Loaded ${transferFormat} manifest.`;

    const { presentationTimeOffsetSeconds, timeCorrectionSeconds, windowStartTime, windowEndTime } = time;

    if (!isNaN(windowStartTime)) {
      logMessage += ` Window start time [ms]: ${windowStartTime}.`;
    }

    if (!isNaN(windowEndTime)) {
      logMessage += ` Window end time [ms]: ${windowEndTime}.`;
    }

    if (!isNaN(timeCorrectionSeconds)) {
      logMessage += ` Correction [s]: ${timeCorrectionSeconds}.`;
    }

    if (!isNaN(presentationTimeOffsetSeconds)) {
      logMessage += ` Offset [s]: ${presentationTimeOffsetSeconds}.`;
    }

    DebugToolInstance.info(logMessage);
  }

  function updateDebugOutput() {
    DebugToolInstance.dynamicMetric("cdns-available", availableCdns());
    DebugToolInstance.dynamicMetric("current-url", stripQueryParamsAndHash(getCurrentUrl()));

    DebugToolInstance.dynamicMetric("subtitle-cdns-available", availableSubtitlesCdns());
    DebugToolInstance.dynamicMetric("subtitle-current-url", stripQueryParamsAndHash(getCurrentSubtitlesUrl()));
  }

  function tearDown() {
    failoverResetTokens.forEach((token) => clearTimeout(token));

    windowType = undefined;
    liveSupport = undefined;
    initialWallclockTime = undefined;
    time = {};
    transferFormat = undefined;
    mediaSources = [];
    failedOverSources = [];
    failoverResetTokens = [];
    subtitlesSources = [];
  }

  return {
    init,
    failover,
    failoverSubtitles,
    refresh,
    currentSource: getCurrentUrl,
    currentSubtitlesSource: getCurrentSubtitlesUrl,
    currentSubtitlesSegmentLength: getCurrentSubtitlesSegmentLength,
    currentSubtitlesCdn: getCurrentSubtitlesCdn,
    subtitlesRequestTimeout: getSubtitlesRequestTimeout,
    availableSources: availableUrls,
    failoverResetTime,
    time: generateTime,
    tearDown,
  }
}

function Resizer() {
    let resized;
    function resize(element, top, left, width, height, zIndex) {
        element.style.top = `${top}px`;
        element.style.left = `${left}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
        element.style.zIndex = `${zIndex}`;
        element.style.position = "absolute";
        resized = true;
    }
    function clear(element) {
        element.style.top = "";
        element.style.left = "";
        element.style.width = "";
        element.style.height = "";
        element.style.zIndex = "";
        element.style.position = "";
        resized = false;
    }
    function isResized() {
        return resized || false;
    }
    return {
        resize,
        clear,
        isResized,
    };
}

function ReadyHelper(initialPlaybackTime, windowType, liveSupport, callback) {
    let ready = false;
    const callbackWhenReady = ({ data, timeUpdate }) => {
        if (ready)
            return;
        if (!data) {
            ready = false;
        }
        else if (timeUpdate) {
            ready = isValidTime(data);
        }
        else {
            ready = isValidState(data) && isValidTime(data);
        }
        if (ready && callback) {
            callback();
        }
    };
    function isValidState({ state }) {
        return state ? state !== MediaState.FATAL_ERROR : false;
    }
    function isValidTime({ currentTime, seekableRange }) {
        const isStatic = windowType === WindowTypes.STATIC;
        if (isStatic)
            return validateStaticTime(currentTime);
        if (seekableRange)
            return validateLiveTime(currentTime, seekableRange);
        return false;
    }
    function validateStaticTime(currentTime) {
        if (currentTime !== undefined) {
            return initialPlaybackTime ? currentTime > 0 : currentTime >= 0;
        }
        return false;
    }
    function validateLiveTime(currentTime, seekableRange) {
        if (liveSupport === LiveSupport.PLAYABLE) {
            return currentTime ? currentTime >= 0 : false;
        }
        return isValidSeekableRange(seekableRange);
    }
    function isValidSeekableRange(seekableRange) {
        return seekableRange ? !(seekableRange.start === 0 && seekableRange.end === 0) : false;
    }
    return {
        callbackWhenReady,
    };
}

function Subtitles(mediaPlayer, autoStart, playbackElement, defaultStyleOpts, mediaSources, callback) {
  const useLegacySubs = window.bigscreenPlayer?.overrides?.legacySubtitles ?? false;
  const dashSubs = window.bigscreenPlayer?.overrides?.dashSubtitles ?? false;

  const isSeekableLiveSupport =
    window.bigscreenPlayer.liveSupport == null || window.bigscreenPlayer.liveSupport === "seekable";

  let subtitlesEnabled = autoStart;
  let subtitlesContainer;

  if (available()) {
    if (useLegacySubs) {
      import('./legacysubtitles-5c9b1580.js')
        .then(({ default: LegacySubtitles }) => {
          subtitlesContainer = LegacySubtitles(mediaPlayer, autoStart, playbackElement, mediaSources, defaultStyleOpts);
          callback(subtitlesEnabled);
        })
        .catch(() => {
          Plugins.interface.onSubtitlesDynamicLoadError();
        });
    } else if (dashSubs) {
      import('./dashsubtitles-0dd9279f.js')
        .then(({ default: DashSubtitles }) => {
          subtitlesContainer = DashSubtitles(mediaPlayer, autoStart, playbackElement, mediaSources, defaultStyleOpts);
          callback(subtitlesEnabled);
        })
        .catch(() => {
          Plugins.interface.onSubtitlesDynamicLoadError();
        });
    } else {
      import('./imscsubtitles-5d6b8b49.js')
        .then(({ default: IMSCSubtitles }) => {
          subtitlesContainer = IMSCSubtitles(mediaPlayer, autoStart, playbackElement, mediaSources, defaultStyleOpts);
          callback(subtitlesEnabled);
        })
        .catch(() => {
          Plugins.interface.onSubtitlesDynamicLoadError();
        });
    }
  } else {
    /* This is needed to deal with a race condition wherein the Subtitles Callback runs before the Subtitles object
     * has finished construction. This is leveraging a feature of the Javascript Event Loop, specifically how it interacts
     * with Promises, called Microtasks.
     *
     * For more information, please see:
     * https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
     */
    Promise.resolve().then(() => {
      callback(subtitlesEnabled);
    });
  }

  function enable() {
    subtitlesEnabled = true;
  }

  function disable() {
    subtitlesEnabled = false;
  }

  function show() {
    if (available() && enabled()) {
      subtitlesContainer?.start();
    }
  }

  function hide() {
    if (available()) {
      subtitlesContainer?.stop();
    }
  }

  function enabled() {
    return subtitlesEnabled
  }

  function available() {
    if (dashSubs) {
      return true
    }

    const url = mediaSources.currentSubtitlesSource();

    if (!(typeof url === "string" && url !== "")) {
      return false
    }

    const isWhole = findSegmentTemplate(url) == null;

    return isWhole || (!useLegacySubs && isSeekableLiveSupport)
  }

  function setPosition(position) {
    subtitlesContainer?.updatePosition(position);
  }

  function customise(styleOpts) {
    subtitlesContainer?.customise(styleOpts, subtitlesEnabled);
  }

  function renderExample(exampleXmlString, styleOpts, safePosition) {
    subtitlesContainer?.renderExample(exampleXmlString, styleOpts, safePosition);
  }

  function clearExample() {
    subtitlesContainer?.clearExample();
  }

  function tearDown() {
    subtitlesContainer?.tearDown();
  }

  return {
    enable,
    disable,
    show,
    hide,
    enabled,
    available,
    setPosition,
    customise,
    renderExample,
    clearExample,
    tearDown,
  }
}

/**
 * @module bigscreenplayer/bigscreenplayer
 */

function BigscreenPlayer() {
  let stateChangeCallbacks = [];
  let timeUpdateCallbacks = [];
  let subtitleCallbacks = [];

  let playerReadyCallback;
  let playerErrorCallback;
  let mediaKind;
  let initialPlaybackTimeEpoch;
  let serverDate;
  let playerComponent;
  let resizer;
  let pauseTrigger;
  let isSeeking = false;
  let endOfStream;
  let windowType;
  let mediaSources;
  let playbackElement;
  let readyHelper;
  let subtitles;

  const END_OF_STREAM_TOLERANCE = 10;

  function mediaStateUpdateCallback(evt) {
    if (evt.timeUpdate) {
      CallCallbacks(timeUpdateCallbacks, {
        currentTime: evt.data.currentTime,
        endOfStream,
      });
    } else {
      let stateObject = { state: evt.data.state };

      if (evt.data.state === MediaState.PAUSED) {
        endOfStream = false;
        stateObject.trigger = pauseTrigger || PauseTriggers.DEVICE;
        pauseTrigger = undefined;
      }

      if (evt.data.state === MediaState.FATAL_ERROR) {
        stateObject = {
          state: MediaState.FATAL_ERROR,
          isBufferingTimeoutError: evt.isBufferingTimeoutError,
          code: evt.code,
          message: evt.message,
        };
      }

      if (evt.data.state === MediaState.WAITING) {
        stateObject.isSeeking = isSeeking;
        isSeeking = false;
      }

      stateObject.endOfStream = endOfStream;
      DebugToolInstance.statechange(evt.data.state);

      CallCallbacks(stateChangeCallbacks, stateObject);
    }

    if (evt.data.seekableRange) {
      DebugToolInstance.staticMetric("seekable-range", [
        deviceTimeToDate(evt.data.seekableRange.start).getTime(),
        deviceTimeToDate(evt.data.seekableRange.end).getTime(),
      ]);
    }

    if (evt.data.duration) {
      DebugToolInstance.staticMetric("duration", evt.data.duration);
    }

    if (playerComponent && readyHelper) {
      readyHelper.callbackWhenReady(evt);
    }
  }

  function deviceTimeToDate(time) {
    return getWindowStartTime() ? new Date(convertVideoTimeSecondsToEpochMs(time)) : new Date(time * 1000)
  }

  function convertVideoTimeSecondsToEpochMs(seconds) {
    return getWindowStartTime() ? getWindowStartTime() + seconds * 1000 : null
  }

  function bigscreenPlayerDataLoaded(bigscreenPlayerData, enableSubtitles) {
    if (windowType !== WindowTypes.STATIC) {
      serverDate = bigscreenPlayerData.serverDate;

      initialPlaybackTimeEpoch = bigscreenPlayerData.initialPlaybackTime;
      // overwrite initialPlaybackTime with video time (it comes in as epoch time for a sliding/growing window)
      bigscreenPlayerData.initialPlaybackTime = TimeUtils.convertToSeekableVideoTime(
        bigscreenPlayerData.initialPlaybackTime,
        mediaSources.time().windowStartTime
      );
    }

    mediaKind = bigscreenPlayerData.media.kind;
    endOfStream =
      windowType !== WindowTypes.STATIC &&
      !bigscreenPlayerData.initialPlaybackTime &&
      bigscreenPlayerData.initialPlaybackTime !== 0;

    readyHelper = new ReadyHelper(
      bigscreenPlayerData.initialPlaybackTime,
      windowType,
      PlayerComponent.getLiveSupport(),
      playerReadyCallback
    );
    playerComponent = new PlayerComponent(
      playbackElement,
      bigscreenPlayerData,
      mediaSources,
      windowType,
      mediaStateUpdateCallback,
      playerErrorCallback
    );

    subtitles = Subtitles(
      playerComponent,
      enableSubtitles,
      playbackElement,
      bigscreenPlayerData.media.subtitleCustomisation,
      mediaSources,
      callSubtitlesCallbacks
    );
  }

  function getWindowStartTime() {
    return mediaSources && mediaSources.time().windowStartTime
  }

  function getWindowEndTime() {
    return mediaSources && mediaSources.time().windowEndTime
  }

  function toggleDebug() {
    if (playerComponent) {
      DebugToolInstance.toggleVisibility();
    }
  }

  function callSubtitlesCallbacks(enabled) {
    CallCallbacks(subtitleCallbacks, { enabled });
  }

  function setSubtitlesEnabled(enabled) {
    enabled ? subtitles.enable() : subtitles.disable();
    callSubtitlesCallbacks(enabled);

    if (!resizer.isResized()) {
      enabled ? subtitles.show() : subtitles.hide();
    }
  }

  function isSubtitlesEnabled() {
    return subtitles ? subtitles.enabled() : false
  }

  function isSubtitlesAvailable() {
    return subtitles ? subtitles.available() : false
  }

  return /** @alias module:bigscreenplayer/bigscreenplayer */ {
    /**
     * Call first to initialise bigscreen player for playback.
     * @function
     * @name init
     * @param {HTMLDivElement} playbackElement - The Div element where content elements should be rendered
     * @param {InitData} bigscreenPlayerData
     * @param {WindowTypes} newWindowType
     * @param {boolean} enableSubtitles - Enable subtitles on initialisation
     * @param {InitCallbacks} callbacks
     */
    init: (newPlaybackElement, bigscreenPlayerData, newWindowType, enableSubtitles, callbacks = {}) => {
      playbackElement = newPlaybackElement;
      resizer = Resizer();
      DebugToolInstance.init();
      DebugToolInstance.setRootElement(playbackElement);

      DebugToolInstance.staticMetric("version", Version);

      if (typeof bigscreenPlayerData.initialPlaybackTime === "number") {
        DebugToolInstance.staticMetric("initial-playback-time", bigscreenPlayerData.initialPlaybackTime);
      }
      if (typeof window.bigscreenPlayer?.playbackStrategy === "string") {
        DebugToolInstance.staticMetric("strategy", window.bigscreenPlayer && window.bigscreenPlayer.playbackStrategy);
      }

      windowType = newWindowType;
      serverDate = bigscreenPlayerData.serverDate;

      if (serverDate) {
        DebugToolInstance.warn("Passing in server date is deprecated. Use <UTCTiming> on manifest.");
      }

      playerReadyCallback = callbacks.onSuccess;
      playerErrorCallback = callbacks.onError;

      const mediaSourceCallbacks = {
        onSuccess: () => bigscreenPlayerDataLoaded(bigscreenPlayerData, enableSubtitles),
        onError: (error) => {
          if (callbacks.onError) {
            callbacks.onError(error);
          }
        },
      };

      mediaSources = MediaSources();

      mediaSources.init(bigscreenPlayerData.media, serverDate, windowType, getLiveSupport(), mediaSourceCallbacks);
    },

    /**
     * Should be called at the end of all playback sessions. Resets state and clears any UI.
     * @function
     * @name tearDown
     */
    tearDown() {
      if (subtitles) {
        subtitles.tearDown();
        subtitles = undefined;
      }

      if (playerComponent) {
        playerComponent.tearDown();
        playerComponent = undefined;
      }

      if (mediaSources) {
        mediaSources.tearDown();
        mediaSources = undefined;
      }

      stateChangeCallbacks = [];
      timeUpdateCallbacks = [];
      subtitleCallbacks = [];
      endOfStream = undefined;
      mediaKind = undefined;
      pauseTrigger = undefined;
      windowType = undefined;
      resizer = undefined;
      this.unregisterPlugin();
      DebugToolInstance.tearDown();
    },

    /**
     * Pass a function to call whenever the player transitions state.
     * @see {@link module:models/mediastate}
     * @function
     * @param {Function} callback
     */
    registerForStateChanges: (callback) => {
      stateChangeCallbacks.push(callback);
      return callback
    },

    /**
     * Unregisters a previously registered callback.
     * @function
     * @param {Function} callback
     */
    unregisterForStateChanges: (callback) => {
      const indexOf = stateChangeCallbacks.indexOf(callback);
      if (indexOf !== -1) {
        stateChangeCallbacks.splice(indexOf, 1);
      }
    },

    /**
     * Pass a function to call whenever the player issues a time update.
     * @function
     * @param {Function} callback
     */
    registerForTimeUpdates: (callback) => {
      timeUpdateCallbacks.push(callback);
      return callback
    },

    /**
     * Unregisters a previously registered callback.
     * @function
     * @param {Function} callback
     */
    unregisterForTimeUpdates: (callback) => {
      const indexOf = timeUpdateCallbacks.indexOf(callback);
      if (indexOf !== -1) {
        timeUpdateCallbacks.splice(indexOf, 1);
      }
    },

    /**
     * Pass a function to be called whenever subtitles are enabled or disabled.
     * @function
     * @param {Function} callback
     */
    registerForSubtitleChanges: (callback) => {
      subtitleCallbacks.push(callback);
      return callback
    },

    /**
     * Unregisters a previously registered callback for changes to subtitles.
     * @function
     * @param {Function} callback
     */
    unregisterForSubtitleChanges: (callback) => {
      const indexOf = subtitleCallbacks.indexOf(callback);
      if (indexOf !== -1) {
        subtitleCallbacks.splice(indexOf, 1);
      }
    },

    /**
     * Sets the current time of the media asset.
     * @function
     * @param {Number} time - In seconds
     */
    setCurrentTime(time) {
      DebugToolInstance.apicall("setCurrentTime", [time]);

      if (playerComponent) {
        // this flag must be set before calling into playerComponent.setCurrentTime - as this synchronously fires a WAITING event (when native strategy).
        isSeeking = true;
        playerComponent.setCurrentTime(time);
        endOfStream =
          windowType !== WindowTypes.STATIC && Math.abs(this.getSeekableRange().end - time) < END_OF_STREAM_TOLERANCE;
      }
    },

    /**
     * Set the media element playback rate
     *
     * @function
     * @param {Number} rate
     */
    setPlaybackRate: (rate) => {
      if (playerComponent) {
        playerComponent.setPlaybackRate(rate);
      }
    },

    /**
     * Get the current playback rate
     * @function
     * @returns {Number} the current media playback rate
     */
    getPlaybackRate: () => playerComponent && playerComponent.getPlaybackRate(),

    /**
     * Returns the media asset's current time in seconds.
     * @function
     * @returns {Number}
     */
    getCurrentTime: () => (playerComponent && playerComponent.getCurrentTime()) || 0,

    /**
     * Returns the current media kind.
     * 'audio' or 'video'
     * @function
     */
    getMediaKind: () => mediaKind,

    /**
     * Returns the current window type.
     * @see {@link module:bigscreenplayer/models/windowtypes}
     * @function
     */
    getWindowType: () => windowType,

    /**
     * Returns an object including the current start and end times.
     * @function
     * @returns {Object} {start: Number, end: Number}
     */
    getSeekableRange: () => (playerComponent ? playerComponent.getSeekableRange() : {}),

    /**
     * @function
     * @returns {boolean} Returns true if media is initialised and playing a live stream within a tolerance of the end of the seekable range (10 seconds).
     */
    isPlayingAtLiveEdge() {
      return (
        !!playerComponent &&
        windowType !== WindowTypes.STATIC &&
        Math.abs(this.getSeekableRange().end - this.getCurrentTime()) < END_OF_STREAM_TOLERANCE
      )
    },

    /**
     * @function
     * @return {Object} An object of the shape {windowStartTime: Number, windowEndTime: Number, initialPlaybackTime: Number, serverDate: Date}
     */
    getLiveWindowData: () => {
      if (windowType === WindowTypes.STATIC) {
        return {}
      }

      return {
        windowStartTime: getWindowStartTime(),
        windowEndTime: getWindowEndTime(),
        initialPlaybackTime: initialPlaybackTimeEpoch,
        serverDate,
      }
    },

    /**
     * @function
     * @returns the duration of the media asset.
     */
    getDuration: () => playerComponent && playerComponent.getDuration(),

    /**
     * @function
     * @returns if the player is paused.
     */
    isPaused: () => (playerComponent ? playerComponent.isPaused() : true),

    /**
     * @function
     * @returns if the media asset has ended.
     */
    isEnded: () => (playerComponent ? playerComponent.isEnded() : false),

    /**
     * Play the media assest from the current point in time.
     * @function
     */
    play: () => {
      DebugToolInstance.apicall("play");

      playerComponent.play();
    },
    /**
     * Pause the media asset.
     * @function
     * @param {*} opts
     * @param {boolean} opts.userPause
     * @param {boolean} opts.disableAutoResume
     */
    pause: (opts) => {
      DebugToolInstance.apicall("pause");

      pauseTrigger = opts && opts.userPause === false ? PauseTriggers.APP : PauseTriggers.USER;
      playerComponent.pause({ pauseTrigger, ...opts });
    },

    /**
     * Resize the video container div in the most compatible way
     *
     * @function
     * @param {Number} top - px
     * @param {Number} left -  px
     * @param {Number} width -  px
     * @param {Number} height -  px
     * @param {Number} zIndex
     */
    resize: (top, left, width, height, zIndex) => {
      subtitles.hide();
      resizer.resize(playbackElement, top, left, width, height, zIndex);
    },

    /**
     * Clear any resize properties added with `resize`
     * @function
     */
    clearResize: () => {
      if (subtitles.enabled()) {
        subtitles.show();
      } else {
        subtitles.hide();
      }
      resizer.clear(playbackElement);
    },

    /**
     * Set whether or not subtitles should be enabled.
     * @function
     * @param {boolean} value
     */
    setSubtitlesEnabled,

    /**
     * @function
     * @return if subtitles are currently enabled.
     */
    isSubtitlesEnabled,

    /**
     * @function
     * @return Returns whether or not subtitles are currently enabled.
     */
    isSubtitlesAvailable,

    /**
     * Returns if a device supports the customisation of subtitles
     *
     * @returns boolean
     */
    areSubtitlesCustomisable: () =>
      !(window.bigscreenPlayer && window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.legacySubtitles),

    /**
     * Customise the rendered subitles style
     *
     * @param {SubtitlesCustomisationOptions} styleOpts
     */
    customiseSubtitles: (styleOpts) => {
      if (subtitles) {
        subtitles.customise(styleOpts);
      }
    },

    /**
     * Render an example subtitles string with a given style and location
     *
     * @param {string} xmlString - EBU-TT-D compliant XML String
     * @param {SubtitlesCustomisationOptions} styleOpts
     * @param {DOMRect} safePosition
     */
    renderSubtitleExample: (xmlString, styleOpts, safePosition) => {
      if (subtitles) {
        subtitles.renderExample(xmlString, styleOpts, safePosition);
      }
    },

    /**
     * Clear the example subtitle string
     */
    clearSubtitleExample: () => {
      if (subtitles) {
        subtitles.clearExample();
      }
    },

    /**
     *
     * An enum may be used to set the on-screen position of any transport controls
     * (work in progress to remove this - UI concern).
     * @function
     * @param {*} position
     */
    setTransportControlsPosition: (position) => {
      if (subtitles) {
        subtitles.setPosition(position);
      }
    },

    /**
     * @function
     * @return Returns whether the current media asset is seekable.
     */
    canSeek() {
      return (
        windowType === WindowTypes.STATIC ||
        DynamicWindowUtils.canSeek(getWindowStartTime(), getWindowEndTime(), getLiveSupport(), this.getSeekableRange())
      )
    },

    /**
     * @function
     * @return Returns whether the current media asset is pausable.
     */
    canPause: () =>
      windowType === WindowTypes.STATIC ||
      DynamicWindowUtils.canPause(getWindowStartTime(), getWindowEndTime(), getLiveSupport()),

    /**
     * Return a mock for in place testing.
     * @function
     * @param {*} opts
     */
    mock(opts) {
      MockBigscreenPlayer.mock(this, opts);
    },

    /**
     * Unmock the player.
     * @function
     */
    unmock() {
      MockBigscreenPlayer.unmock(this);
    },

    /**
     * Return a mock for unit tests.
     * @function
     * @param {*} opts
     */
    mockJasmine(opts) {
      MockBigscreenPlayer.mockJasmine(this, opts);
    },

    /**
     * Register a plugin for extended events.
     * @function
     * @param {*} plugin
     */
    registerPlugin: (plugin) => Plugins.registerPlugin(plugin),

    /**
     * Unregister a previously registered plugin.
     * @function
     * @param {*} plugin
     */
    unregisterPlugin: (plugin) => Plugins.unregisterPlugin(plugin),

    /**
     * Returns an object with a number of functions related to the ability to transition state
     * given the current state and the playback strategy in use.
     * @function
     */
    transitions: () => (playerComponent ? playerComponent.transitions() : {}),

    /**
     * @function
     * @return The media element currently being used.
     */
    getPlayerElement: () => playerComponent && playerComponent.getPlayerElement(),

    /**
     * @function
     * @param {Number} epochTime - Unix Epoch based time in milliseconds.
     * @return the time in seconds within the current sliding window.
     */
    convertEpochMsToVideoTimeSeconds: (epochTime) =>
      getWindowStartTime() ? Math.floor((epochTime - getWindowStartTime()) / 1000) : null,

    /**
     * @function
     * @return The runtime version of the library.
     */
    getFrameworkVersion: () => Version,

    /**
     * @function
     * @param {Number} time - Seconds
     * @return the time in milliseconds within the current sliding window.
     */
    convertVideoTimeSecondsToEpochMs,

    /**
     * Toggle the visibility of the debug tool overlay.
     * @function
     */
    toggleDebug,

    /**
     * @function
     * @return {Object} - Key value pairs of available log levels
     */
    getLogLevels: () => DebugToolInstance.logLevels,

    /**
     * @function
     * @param logLevel -  log level to display @see getLogLevels
     */
    setLogLevel: (level) => DebugToolInstance.setLogLevel(level),
    getDebugLogs: () => DebugToolInstance.getDebugLogs(),
  }
}

/**
 * @function
 * @param {TALDevice} device
 * @return the live support of the device.
 */
function getLiveSupport() {
  return PlayerComponent.getLiveSupport()
}

BigscreenPlayer.getLiveSupport = getLiveSupport;

BigscreenPlayer.version = Version;

/**
 * Provides an enumeration of on-screen transport control positions, which can be combined as flags.
 */
const TransportControlPosition = {
    /** No transport controls are visible. */
    NONE: 0,
    /** The basic transport controls are visible. */
    CONTROLS_ONLY: 1,
    /** The transport controls are visible with an expanded info area. */
    CONTROLS_WITH_INFO: 2,
    /** The left-hand onwards navigation carousel is visible. */
    LEFT_CAROUSEL: 4,
    /** The bottom-right onwards navigation carousel is visible. */
    BOTTOM_CAROUSEL: 8,
    /** The whole screen is obscured by a navigation menu. */
    FULLSCREEN: 16,
};

export { BigscreenPlayer as B, DOMHelpers as D, EntryCategory as E, LoadUrl as L, MediaState as M, Plugins as P, TransportControlPosition as T, Utils as U, WindowTypes as W, DebugToolInstance as a, PauseTriggers as b, LiveSupport as c, MediaKinds as d, TimeUtils as e, findSegmentTemplate as f, DynamicWindowUtils as g, MockBigscreenPlayer as h, PlaybackStrategy as i, TransferFormat as j, isMessage as k, isMetric as l, isTrace as m };
