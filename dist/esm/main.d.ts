import { MediaPlayerSettingClass } from 'dashjs';

type Connection = {
    cdn: string;
    url: string;
};
type CaptionsConnection = Connection & {
    segmentLenght: number;
};
type Settings = MediaPlayerSettingClass & {
    failoverResetTime: number;
    failoverSort: (sources: string[]) => string[];
    streaming: {
        seekDurationPadding: number;
    };
};
type SubtitlesCustomisationOptions = Partial<{
    /** CSS background-color string or hex string */
    backgroundColor: string;
    /** CSS font-family string */
    fontFamily: string;
    /** lineHeight multiplier to authored subtitles */
    lineHeight: number;
    /** size multiplier to authored subtitles */
    size: number;
}>;
type InitData = {
    media: {
        kind: "audio" | "video";
        /** f.ex. 'video/mp4' */
        mimeType: string;
        /** source type. f.ex. 'application/dash+xml' */
        type: string;
        urls: Connection[];
        captions?: CaptionsConnection[];
        /** Location for a captions file */
        captionsUrl?: string;
        playerSettings?: Partial<Settings>;
        subtitlesCustomisation?: SubtitlesCustomisationOptions;
        subtitlesRequestTimeout?: number;
    };
    /**
     * @deprecated
     * Date object with server time offset
     */
    serverDate?: Date;
};
type InitCallbacks = {
    onError: () => void;
    onSuccess: () => void;
};

/**
 * Enums for WindowTypes
 * @readonly
 * @enum {string}
 */
declare const WindowTypes: {
    /** Media with a duration */
    readonly STATIC: "staticWindow";
    /** Media with a start time but without a duration until an indeterminate time in the future */
    readonly GROWING: "growingWindow";
    /** Media with a rewind window that progresses through a media timeline */
    readonly SLIDING: "slidingWindow";
};
type WindowTypes = (typeof WindowTypes)[keyof typeof WindowTypes];

declare const _default$1: "__VERSION__";

declare function BigscreenPlayer(): {
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
    init: (newPlaybackElement: any, bigscreenPlayerData: InitData, newWindowType: WindowTypes, enableSubtitles: boolean, callbacks?: InitCallbacks) => void;
    /**
     * Should be called at the end of all playback sessions. Resets state and clears any UI.
     * @function
     * @name tearDown
     */
    tearDown(): void;
    /**
     * Pass a function to call whenever the player transitions state.
     * @see {@link module:models/mediastate}
     * @function
     * @param {Function} callback
     */
    registerForStateChanges: (callback: Function) => Function;
    /**
     * Unregisters a previously registered callback.
     * @function
     * @param {Function} callback
     */
    unregisterForStateChanges: (callback: Function) => void;
    /**
     * Pass a function to call whenever the player issues a time update.
     * @function
     * @param {Function} callback
     */
    registerForTimeUpdates: (callback: Function) => Function;
    /**
     * Unregisters a previously registered callback.
     * @function
     * @param {Function} callback
     */
    unregisterForTimeUpdates: (callback: Function) => void;
    /**
     * Pass a function to be called whenever subtitles are enabled or disabled.
     * @function
     * @param {Function} callback
     */
    registerForSubtitleChanges: (callback: Function) => Function;
    /**
     * Unregisters a previously registered callback for changes to subtitles.
     * @function
     * @param {Function} callback
     */
    unregisterForSubtitleChanges: (callback: Function) => void;
    /**
     * Sets the current time of the media asset.
     * @function
     * @param {Number} time - In seconds
     */
    setCurrentTime(time: number): void;
    /**
     * Set the media element playback rate
     *
     * @function
     * @param {Number} rate
     */
    setPlaybackRate: (rate: number) => void;
    /**
     * Get the current playback rate
     * @function
     * @returns {Number} the current media playback rate
     */
    getPlaybackRate: () => number;
    /**
     * Returns the media asset's current time in seconds.
     * @function
     * @returns {Number}
     */
    getCurrentTime: () => number;
    /**
     * Returns the current media kind.
     * 'audio' or 'video'
     * @function
     */
    getMediaKind: () => any;
    /**
     * Returns the current window type.
     * @see {@link module:bigscreenplayer/models/windowtypes}
     * @function
     */
    getWindowType: () => any;
    /**
     * Returns an object including the current start and end times.
     * @function
     * @returns {Object} {start: Number, end: Number}
     */
    getSeekableRange: () => Object;
    /**
     * @function
     * @returns {boolean} Returns true if media is initialised and playing a live stream within a tolerance of the end of the seekable range (10 seconds).
     */
    isPlayingAtLiveEdge(): boolean;
    /**
     * @function
     * @return {Object} An object of the shape {windowStartTime: Number, windowEndTime: Number, initialPlaybackTime: Number, serverDate: Date}
     */
    getLiveWindowData: () => Object;
    /**
     * @function
     * @returns the duration of the media asset.
     */
    getDuration: () => any;
    /**
     * @function
     * @returns if the player is paused.
     */
    isPaused: () => any;
    /**
     * @function
     * @returns if the media asset has ended.
     */
    isEnded: () => any;
    /**
     * Play the media assest from the current point in time.
     * @function
     */
    play: () => void;
    /**
     * Pause the media asset.
     * @function
     * @param {*} opts
     * @param {boolean} opts.userPause
     * @param {boolean} opts.disableAutoResume
     */
    pause: (opts: any) => void;
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
    resize: (top: number, left: number, width: number, height: number, zIndex: number) => void;
    /**
     * Clear any resize properties added with `resize`
     * @function
     */
    clearResize: () => void;
    /**
     * Set whether or not subtitles should be enabled.
     * @function
     * @param {boolean} value
     */
    setSubtitlesEnabled: (enabled: any) => void;
    /**
     * @function
     * @return if subtitles are currently enabled.
     */
    isSubtitlesEnabled: () => any;
    /**
     * @function
     * @return Returns whether or not subtitles are currently enabled.
     */
    isSubtitlesAvailable: () => any;
    /**
     * Returns if a device supports the customisation of subtitles
     *
     * @returns boolean
     */
    areSubtitlesCustomisable: () => boolean;
    /**
     * Customise the rendered subitles style
     *
     * @param {SubtitlesCustomisationOptions} styleOpts
     */
    customiseSubtitles: (styleOpts: SubtitlesCustomisationOptions) => void;
    /**
     * Render an example subtitles string with a given style and location
     *
     * @param {string} xmlString - EBU-TT-D compliant XML String
     * @param {SubtitlesCustomisationOptions} styleOpts
     * @param {DOMRect} safePosition
     */
    renderSubtitleExample: (xmlString: string, styleOpts: SubtitlesCustomisationOptions, safePosition: DOMRect) => void;
    /**
     * Clear the example subtitle string
     */
    clearSubtitleExample: () => void;
    /**
     *
     * An enum may be used to set the on-screen position of any transport controls
     * (work in progress to remove this - UI concern).
     * @function
     * @param {*} position
     */
    setTransportControlsPosition: (position: any) => void;
    /**
     * @function
     * @return Returns whether the current media asset is seekable.
     */
    canSeek(): boolean;
    /**
     * @function
     * @return Returns whether the current media asset is pausable.
     */
    canPause: () => boolean;
    /**
     * Return a mock for in place testing.
     * @function
     * @param {*} opts
     */
    mock(opts: any): void;
    /**
     * Unmock the player.
     * @function
     */
    unmock(): void;
    /**
     * Return a mock for unit tests.
     * @function
     * @param {*} opts
     */
    mockJasmine(opts: any): void;
    /**
     * Register a plugin for extended events.
     * @function
     * @param {*} plugin
     */
    registerPlugin: (plugin: any) => void;
    /**
     * Unregister a previously registered plugin.
     * @function
     * @param {*} plugin
     */
    unregisterPlugin: (plugin: any) => void;
    /**
     * Returns an object with a number of functions related to the ability to transition state
     * given the current state and the playback strategy in use.
     * @function
     */
    transitions: () => any;
    /**
     * @function
     * @return The media element currently being used.
     */
    getPlayerElement: () => any;
    /**
     * @function
     * @param {Number} epochTime - Unix Epoch based time in milliseconds.
     * @return the time in seconds within the current sliding window.
     */
    convertEpochMsToVideoTimeSeconds: (epochTime: number) => number | null;
    /**
     * @function
     * @return The runtime version of the library.
     */
    getFrameworkVersion: () => string;
    /**
     * @function
     * @param {Number} time - Seconds
     * @return the time in milliseconds within the current sliding window.
     */
    convertVideoTimeSecondsToEpochMs: (seconds: any) => any;
    /**
     * Toggle the visibility of the debug tool overlay.
     * @function
     */
    toggleDebug: () => void;
    /**
     * @function
     * @return {Object} - Key value pairs of available log levels
     */
    getLogLevels: () => Object;
    /**
     * @function
     * @param logLevel -  log level to display @see getLogLevels
     */
    setLogLevel: (level: any) => void;
    getDebugLogs: () => Timestamped<Entry>[];
};
declare namespace BigscreenPlayer {
    export { getLiveSupport };
    export { _default$1 as version };
}

/**
 * @function
 * @param {TALDevice} device
 * @return the live support of the device.
 */
declare function getLiveSupport(): any;

declare namespace _default {
    export { mock };
    export { unmock };
    export { mockJasmine };
}

declare function mock(BigscreenPlayer: any, opts: any): void;
declare function unmock(BigscreenPlayer: any): void;
declare function mockJasmine(BigscreenPlayer: any, opts: any): void;

declare const LiveSupport: {
    readonly NONE: "none";
    readonly PLAYABLE: "playable";
    readonly RESTARTABLE: "restartable";
    readonly SEEKABLE: "seekable";
};
type LiveSupport = (typeof LiveSupport)[keyof typeof LiveSupport];

declare const MediaKinds: {
    readonly AUDIO: "audio";
    readonly VIDEO: "video";
};
type MediaKinds = (typeof MediaKinds)[keyof typeof MediaKinds];

/**
 * Provides an enumeration of possible media states.
 */
declare const MediaState: {
    /** Media is stopped and is not attempting to start. */
    readonly STOPPED: 0;
    /** Media is paused. */
    readonly PAUSED: 1;
    /** Media is playing successfully. */
    readonly PLAYING: 2;
    /** Media is waiting for data (buffering). */
    readonly WAITING: 4;
    /** Media has ended. */
    readonly ENDED: 5;
    /** Media has thrown a fatal error. */
    readonly FATAL_ERROR: 6;
};
type MediaState = (typeof MediaState)[keyof typeof MediaState];

declare const PauseTriggers: {
    readonly USER: 1;
    readonly APP: 2;
    readonly DEVICE: 3;
};
type PauseTriggers = (typeof PauseTriggers)[keyof typeof PauseTriggers];

declare const PlaybackStrategy$1: {
    readonly MSE: "msestrategy";
    readonly NATIVE: "nativestrategy";
    readonly BASIC: "basicstrategy";
};
type PlaybackStrategy$1 = (typeof PlaybackStrategy$1)[keyof typeof PlaybackStrategy$1];

declare const TransferFormat: {
    readonly DASH: "dash";
    readonly HLS: "hls";
};
type TransferFormat = (typeof TransferFormat)[keyof typeof TransferFormat];

/**
 * Provides an enumeration of on-screen transport control positions, which can be combined as flags.
 */
declare const TransportControlPosition: {
    /** No transport controls are visible. */
    readonly NONE: 0;
    /** The basic transport controls are visible. */
    readonly CONTROLS_ONLY: 1;
    /** The transport controls are visible with an expanded info area. */
    readonly CONTROLS_WITH_INFO: 2;
    /** The left-hand onwards navigation carousel is visible. */
    readonly LEFT_CAROUSEL: 4;
    /** The bottom-right onwards navigation carousel is visible. */
    readonly BOTTOM_CAROUSEL: 8;
    /** The whole screen is obscured by a navigation menu. */
    readonly FULLSCREEN: 16;
};
type TransportControlPosition = (typeof TransportControlPosition)[keyof typeof TransportControlPosition];

declare enum EntryCategory {
    METRIC = "metric",
    MESSAGE = "message",
    TRACE = "trace"
}
type CreateMessage<Kind extends string> = {
    category: EntryCategory.MESSAGE;
    kind: Kind;
    data: string;
};
type InfoMessage = CreateMessage<"info">;
type WarningMessage = CreateMessage<"warning">;
type DebugMessage = CreateMessage<"debug">;
type Message = InfoMessage | WarningMessage | DebugMessage;
type MessageKind = Message["kind"];
type MessageForKind<Kind extends MessageKind> = Extract<Message, {
    kind: Kind;
}>;
type MessageLike = CreateMessage<string>;
type Primitive = string | number | bigint | boolean;
type Primitives = Primitive | Primitive[] | Primitives[];
type CreateMetric<Kind extends string, Data extends Primitives> = {
    category: EntryCategory.METRIC;
    kind: Kind;
    data: Data;
};
type AutoResume = CreateMetric<"auto-resume", number>;
type BitRate = CreateMetric<"bitrate", number>;
type BufferLength = CreateMetric<"buffer-length", number>;
type CDNsAvailable = CreateMetric<"cdns-available", string[]>;
type CurrentUrl = CreateMetric<"current-url", string>;
type Duration = CreateMetric<"duration", number>;
type FramesDropped = CreateMetric<"frames-dropped", number>;
type InitialPlaybackTime = CreateMetric<"initial-playback-time", number>;
type MediaElementEnded = CreateMetric<"ended", HTMLMediaElement["ended"]>;
type MediaElementPaused = CreateMetric<"paused", HTMLMediaElement["paused"]>;
type MediaElementPlaybackRate = CreateMetric<"playback-rate", HTMLMediaElement["playbackRate"]>;
type MediaElementReadyState = CreateMetric<"ready-state", HTMLMediaElement["readyState"]>;
type MediaElementSeeking = CreateMetric<"seeking", HTMLMediaElement["seeking"]>;
type PlaybackStrategy = CreateMetric<"strategy", string>;
type RepresentationAudio = CreateMetric<"representation-audio", [qualityIndex: number, bitrate: number]>;
type RepresentationVideo = CreateMetric<"representation-video", [qualityIndex: number, bitrate: number]>;
type SeekableRange = CreateMetric<"seekable-range", [start: number, end: number]>;
type SubtitleCDNsAvailable = CreateMetric<"subtitle-cdns-available", string[]>;
type SubtitleCurrentUrl = CreateMetric<"subtitle-current-url", string>;
type Version = CreateMetric<"version", string>;
type Metric = AutoResume | BitRate | BufferLength | CDNsAvailable | CurrentUrl | Duration | FramesDropped | InitialPlaybackTime | MediaElementEnded | MediaElementPaused | MediaElementPlaybackRate | MediaElementReadyState | MediaElementSeeking | PlaybackStrategy | RepresentationAudio | RepresentationVideo | SeekableRange | SubtitleCDNsAvailable | SubtitleCurrentUrl | Version;
type MetricKind = Metric["kind"];
type MetricForKind<Kind extends MetricKind> = Extract<Metric, {
    kind: Kind;
}>;
type MetricLike = CreateMetric<string, Primitives>;
type CreateTrace<Kind extends string, Data extends Primitives | Record<string, Primitives>> = {
    category: EntryCategory.TRACE;
    kind: Kind;
    data: Data;
};
type ApiCall = CreateTrace<"apicall", {
    functionName: string;
    functionArgs: any[];
}>;
type BufferedRanges = CreateTrace<"buffered-ranges", {
    kind: MediaKinds;
    buffered: [start: number, end: number][];
}>;
type Error = CreateTrace<"error", {
    name?: string;
    message: string;
}>;
type Event = CreateTrace<"event", {
    eventType: string;
    eventTarget: string;
}>;
type Gap = CreateTrace<"gap", {
    from: number;
    to: number;
}>;
type QuotaExceeded = CreateTrace<"quota-exceeded", {
    bufferLevel: number;
    time: number;
}>;
type SessionStart = CreateTrace<"session-start", number>;
type SessionEnd = CreateTrace<"session-end", number>;
type StateChange = CreateTrace<"state-change", MediaState>;
type Trace = ApiCall | BufferedRanges | Error | Event | Gap | QuotaExceeded | SessionStart | SessionEnd | StateChange;
type TraceKind = Trace["kind"];
type TraceForKind<Kind extends TraceKind> = Extract<Trace, {
    kind: Kind;
}>;
type TraceLike = CreateTrace<string, Primitives | Record<string, Primitives>>;
type Entry = Message | Metric | Trace;
type EntryKind = Entry["kind"];
type Timestamped<Category> = {
    currentElementTime: number;
    sessionTime: number;
} & Category;
type TimestampedEntry = Timestamped<Entry>;
type TimestampedMetric = Timestamped<Metric>;
type TimestampedMessage = Timestamped<Message>;
type TimestampedTrace = Timestamped<Trace>;
type EntryForKind<Kind extends EntryKind> = Extract<Entry, {
    kind: Kind;
}>;
declare const isMessage: <E extends Entry | TimestampedEntry, T extends E extends Entry ? Message : TimestampedMessage>(entry: E) => entry is E & T;
declare const isMetric: <E extends Entry | TimestampedEntry, T extends E extends Entry ? Metric : TimestampedMetric>(entry: E) => entry is E & T;
declare const isTrace: <E extends Entry | TimestampedEntry, T extends E extends Entry ? Trace : TimestampedTrace>(entry: E) => entry is E & T;

declare const LogLevels: {
    readonly ERROR: 0;
    readonly WARN: 1;
    readonly INFO: 2;
    readonly DEBUG: 3;
};
type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];
declare const DebugToolInstance: {
    logLevels: {
        readonly ERROR: 0;
        readonly WARN: 1;
        readonly INFO: 2;
        readonly DEBUG: 3;
    };
    init: () => void;
    tearDown: () => void;
    getDebugLogs: () => Timestamped<Entry>[];
    setLogLevel: (newLogLevel: LogLevel | undefined) => void;
    updateElementTime: (seconds: number) => void;
    apicall: (functionName: string, functionArgs?: any[]) => void;
    buffered: (kind: MediaKinds, buffered: [start: number, end: number][]) => void;
    debug: (...parts: any[]) => void;
    error: (...parts: any[]) => void;
    event: (eventType: string, eventTarget?: string) => void;
    gap: (from: number, to: number) => void;
    quotaExceeded: (bufferLevel: number, time: number) => void;
    info: (...parts: any[]) => void;
    statechange: (value: MediaState) => void;
    warn: (...parts: any[]) => void;
    dynamicMetric: <Kind extends "auto-resume" | "bitrate" | "buffer-length" | "cdns-available" | "current-url" | "duration" | "frames-dropped" | "initial-playback-time" | "ended" | "paused" | "playback-rate" | "ready-state" | "seeking" | "strategy" | "representation-audio" | "representation-video" | "seekable-range" | "subtitle-cdns-available" | "subtitle-current-url" | "version">(kind: Kind, data: MetricForKind<Kind>["data"]) => void;
    staticMetric: <Kind_1 extends "auto-resume" | "bitrate" | "buffer-length" | "cdns-available" | "current-url" | "duration" | "frames-dropped" | "initial-playback-time" | "ended" | "paused" | "playback-rate" | "ready-state" | "seeking" | "strategy" | "representation-audio" | "representation-video" | "seekable-range" | "subtitle-cdns-available" | "subtitle-current-url" | "version">(kind: Kind_1, data: MetricForKind<Kind_1>["data"]) => void;
    hide: () => void;
    show: () => void;
    setRootElement: (element: HTMLElement) => void;
    toggleVisibility: () => void;
};

export { BigscreenPlayer, DebugToolInstance as DebugTool, type Entry, EntryCategory, type EntryForKind, type EntryKind, LiveSupport, MediaKinds, MediaState, type Message, type MessageForKind, type MessageKind, type MessageLike, type Metric, type MetricForKind, type MetricKind, type MetricLike, _default as MockBigscreenPlayer, PauseTriggers, PlaybackStrategy$1 as PlaybackStrategy, type Timestamped, type TimestampedEntry, type TimestampedMessage, type TimestampedMetric, type TimestampedTrace, type Trace, type TraceForKind, type TraceKind, type TraceLike, TransferFormat, TransportControlPosition, WindowTypes, isMessage, isMetric, isTrace };
