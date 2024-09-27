import { MediaPlayer } from 'dashjs/index_mediaplayerOnly';
import { W as WindowTypes, U as Utils, D as DOMHelpers, b as PauseTriggers, c as LiveSupport, a as DebugToolInstance, M as MediaState, P as Plugins, d as MediaKinds, e as TimeUtils, g as DynamicWindowUtils } from './main-94ed743d.js';

function filter(manifest, representationOptions) {
  const constantFps = representationOptions.constantFps;
  const maxFps = representationOptions.maxFps;

  if (constantFps || maxFps) {
    manifest.Period.AdaptationSet = manifest.Period.AdaptationSet.map((adaptationSet) => {
      if (adaptationSet.contentType === "video") {
        const frameRates = [];

        adaptationSet.Representation_asArray = adaptationSet.Representation_asArray.filter((representation) => {
          if (!maxFps || representation.frameRate <= maxFps) {
            frameRates.push(representation.frameRate);
            return true
          }
        }).filter((representation) => !constantFps || representation.frameRate === Math.max.apply(null, frameRates));
      }
      return adaptationSet
    });
  }

  return manifest
}

function extractBaseUrl(manifest) {
  if (manifest.Period && typeof manifest.Period.BaseURL === "string") {
    return manifest.Period.BaseURL
  }

  if (manifest.Period && manifest.Period.BaseURL && typeof manifest.Period.BaseURL.__text === "string") {
    return manifest.Period.BaseURL.__text
  }

  if (typeof manifest.BaseURL === "string") {
    return manifest.BaseURL
  }

  if (manifest.BaseURL && typeof manifest.BaseURL.__text === "string") {
    return manifest.BaseURL.__text
  }
}

function generateBaseUrls(manifest, sources) {
  if (!manifest) return

  const baseUrl = extractBaseUrl(manifest);

  if (isBaseUrlAbsolute(baseUrl)) {
    setAbsoluteBaseUrl(baseUrl);
  } else {
    if (baseUrl) {
      setBaseUrlsFromBaseUrl(baseUrl);
    } else {
      setBaseUrlsFromSource();
    }
  }

  removeUnusedPeriodAttributes();

  function generateBaseUrl(source, priority, serviceLocation) {
    return {
      __text: source,
      "dvb:priority": priority,
      "dvb:weight": isNaN(source.dpw) ? 0 : source.dpw,
      serviceLocation,
    }
  }

  function removeUnusedPeriodAttributes() {
    if (manifest.Period && manifest.Period.BaseURL) delete manifest.Period.BaseURL;
    if (manifest.Period && manifest.Period.BaseURL_asArray) delete manifest.Period.BaseURL_asArray;
  }

  function isBaseUrlAbsolute(baseUrl) {
    return baseUrl && baseUrl.match(/^https?:\/\//)
  }

  function setAbsoluteBaseUrl(baseUrl) {
    const newBaseUrl = generateBaseUrl(baseUrl, 0, sources[0]);

    manifest.BaseURL_asArray = [newBaseUrl];

    if (manifest.BaseURL || (manifest.Period && manifest.Period.BaseURL)) {
      manifest.BaseURL = newBaseUrl;
    }
  }

  function setBaseUrlsFromBaseUrl(baseUrl) {
    manifest.BaseURL_asArray = sources.map((source, priority) => {
      const sourceUrl = new URL(baseUrl, source);

      return generateBaseUrl(sourceUrl.href, priority, source)
    });
  }

  function setBaseUrlsFromSource() {
    manifest.BaseURL_asArray = sources.map((source, priority) => generateBaseUrl(source, priority, source));
  }
}

const ManifestModifier = {
  filter,
  extractBaseUrl,
  generateBaseUrls,
};

/** @enum */
const TimelineZeroPoints = {
  MPD: "mpdTime",
  VIDEO: "videoTime",
  WALLCLOCK: "wallclockTime",
};

/**
 * Calculat time anchor tag for playback within dashjs
 *
 * Anchor tags applied to the MPD source for playback:
 *
 * #t=<time> - Seeks MPD timeline. By itself it means time since the beginning of the first period defined in the DASH manifest.
 * #t=posix:<time> - Seeks availability timeline.
 *
 * @param {number} seconds
 * @param {string} [zeroPoint = TimelineZeroPoints.VIDEO]
 * @returns {string}
 */
function buildSourceAnchor(
  seconds,
  zeroPoint,
  { initialSeekableRangeStartSeconds = 0, windowType = WindowTypes.STATIC } = {}
) {
  if (typeof seconds !== "number" || !isFinite(seconds)) {
    return ""
  }

  const wholeSeconds = parseInt(seconds);

  if (zeroPoint === TimelineZeroPoints.MPD) {
    return `#t=${wholeSeconds}`
  }

  if (zeroPoint === TimelineZeroPoints.WALLCLOCK) {
    return `#t=posix:${wholeSeconds}`
  }

  // zeroPoint is video time
  if (windowType === WindowTypes.SLIDING) {
    return `#t=${initialSeekableRangeStartSeconds + (wholeSeconds === 0 ? 1 : wholeSeconds)}`
  }

  if (windowType === WindowTypes.GROWING) {
    return `#t=posix:${initialSeekableRangeStartSeconds + (wholeSeconds === 0 ? 1 : wholeSeconds)}`
  }

  // window type is static

  return wholeSeconds === 0 ? "" : `#t=${wholeSeconds}`
}

function convertTimeRangesToArray(ranges) {
    const array = [];
    for (let rangesSoFar = 0; rangesSoFar < ranges.length; rangesSoFar += 1) {
        array.push([ranges.start(rangesSoFar), ranges.end(rangesSoFar)]);
    }
    return array;
}

const DEFAULT_SETTINGS = {
  liveDelay: 0,
  seekDurationPadding: 1.1,
};

function MSEStrategy(mediaSources, windowType, mediaKind, playbackElement, isUHD, customPlayerSettings) {
  let mediaPlayer;
  let mediaElement;

  const playerSettings = Utils.merge(
    {
      debug: {
        logLevel: 2,
      },
      streaming: {
        blacklistExpiryTime: mediaSources.failoverResetTime(),
        buffer: {
          bufferToKeep: 4,
          bufferTimeAtTopQuality: 12,
          bufferTimeAtTopQualityLongForm: 15,
        },
      },
    },
    customPlayerSettings
  );

  let eventCallbacks = [];
  let errorCallback;
  let timeUpdateCallback;

  let timeCorrection = mediaSources.time()?.timeCorrectionSeconds || 0;

  const seekDurationPadding = isNaN(playerSettings.streaming?.seekDurationPadding)
    ? DEFAULT_SETTINGS.seekDurationPadding
    : playerSettings.streaming?.seekDurationPadding;
  const liveDelay = isNaN(playerSettings.streaming?.delay?.liveDelay)
    ? DEFAULT_SETTINGS.liveDelay
    : playerSettings.streaming?.delay?.liveDelay;
  let failoverTime;
  let failoverZeroPoint;
  let refreshFailoverTime;
  let slidingWindowPausedTime = 0;
  let isEnded = false;

  let dashMetrics;
  let lastError;

  let publishedSeekEvent = false;
  let isSeeking = false;

  let playerMetadata = {
    playbackBitrate: undefined,
    bufferLength: undefined,
    fragmentInfo: {
      requestTime: undefined,
      numDownloaded: undefined,
    },
  };

  const DashJSEvents = {
    LOG: "log",
    ERROR: "error",
    GAP_JUMP: "gapCausedInternalSeek",
    GAP_JUMP_TO_END: "gapCausedSeekToPeriodEnd",
    MANIFEST_LOADED: "manifestLoaded",
    DOWNLOAD_MANIFEST_ERROR_CODE: 25,
    DOWNLOAD_CONTENT_ERROR_CODE: 27,
    DOWNLOAD_INIT_SEGMENT_ERROR_CODE: 28,
    UNSUPPORTED_CODEC: 30,
    MANIFEST_VALIDITY_CHANGED: "manifestValidityChanged",
    QUALITY_CHANGE_RENDERED: "qualityChangeRendered",
    BASE_URL_SELECTED: "baseUrlSelected",
    SERVICE_LOCATION_AVAILABLE: "serviceLocationUnblacklisted",
    URL_RESOLUTION_FAILED: "urlResolutionFailed",
    METRIC_ADDED: "metricAdded",
    METRIC_CHANGED: "metricChanged",
    STREAM_INITIALIZED: "streamInitialized",
    FRAGMENT_CONTENT_LENGTH_MISMATCH: "fragmentContentLengthMismatch",
    QUOTA_EXCEEDED: "quotaExceeded",
    TEXT_TRACKS_ADDED: "allTextTracksAdded",
  };

  function onLoadedMetaData() {
    DebugToolInstance.event("loadedmetadata", "MediaElement");
    DebugToolInstance.dynamicMetric("ready-state", mediaElement.readyState);
  }

  function onLoadedData() {
    DebugToolInstance.event("loadeddata", "MediaElement");
    DebugToolInstance.dynamicMetric("ready-state", mediaElement.readyState);
  }

  function onPlay() {
    DebugToolInstance.event("play", "MediaElement");
    DebugToolInstance.dynamicMetric("paused", mediaElement.paused);
  }

  function onPlaying() {
    DebugToolInstance.event("playing", "MediaElement");
    DebugToolInstance.dynamicMetric("ready-state", mediaElement.readyState);

    getBufferedRanges().map(({ kind, buffered }) => DebugToolInstance.buffered(kind, buffered));

    isEnded = false;

    publishMediaState(MediaState.PLAYING);
  }

  function onPaused() {
    DebugToolInstance.event("paused", "MediaElement");
    DebugToolInstance.dynamicMetric("paused", mediaElement.paused);

    publishMediaState(MediaState.PAUSED);
  }

  function onBuffering() {
    isEnded = false;

    if (!isSeeking || !publishedSeekEvent) {
      publishMediaState(MediaState.WAITING);
      publishedSeekEvent = true;
    }
  }

  function onSeeked() {
    DebugToolInstance.event("seeked", "MediaElement");
    DebugToolInstance.dynamicMetric("seeking", mediaElement.seeking);

    isSeeking = false;

    if (isPaused()) {
      if (windowType === WindowTypes.SLIDING) {
        startAutoResumeTimeout();
      }
      publishMediaState(MediaState.PAUSED);
    } else {
      publishMediaState(MediaState.PLAYING);
    }
  }

  function onSeeking() {
    DebugToolInstance.event("seeking", "MediaElement");
    DebugToolInstance.dynamicMetric("seeking", mediaElement.seeking);

    onBuffering();
  }

  function onWaiting() {
    DebugToolInstance.event("waiting", "MediaElement");
    DebugToolInstance.dynamicMetric("ready-state", mediaElement.readyState);

    getBufferedRanges().map(({ kind, buffered }) => DebugToolInstance.buffered(kind, buffered));

    onBuffering();
  }

  function onEnded() {
    DebugToolInstance.event("ended", "MediaElement");
    DebugToolInstance.dynamicMetric("ended", mediaElement.ended);

    isEnded = true;

    publishMediaState(MediaState.ENDED);
  }

  function onRateChange() {
    DebugToolInstance.dynamicMetric("playback-rate", mediaElement.playbackRate);
  }

  function onTimeUpdate() {
    DebugToolInstance.updateElementTime(mediaElement.currentTime);

    const currentMpdTimeSeconds =
      windowType === WindowTypes.SLIDING
        ? mediaPlayer.getDashMetrics().getCurrentDVRInfo(mediaKind)?.time
        : mediaElement.currentTime;

    // Note: Multiple consecutive CDN failover logic
    // A newly loaded video element will always report a 0 time update
    // This is slightly unhelpful if we want to continue from a later point but consult failoverTime as the source of truth.
    if (
      typeof currentMpdTimeSeconds === "number" &&
      isFinite(currentMpdTimeSeconds) &&
      parseInt(currentMpdTimeSeconds) > 0
    ) {
      failoverTime = currentMpdTimeSeconds;
      failoverZeroPoint = TimelineZeroPoints.MPD;
    }

    publishTimeUpdate();
  }

  function onError(event) {
    if (event.error && event.error.data) {
      delete event.error.data;
    }

    if (event.error && event.error.message) {
      DebugToolInstance.error(`${event.error.message} (code: ${event.error.code})`);

      lastError = event.error;

      // Don't raise an error on fragment download error
      if (
        (event.error.code === DashJSEvents.DOWNLOAD_CONTENT_ERROR_CODE ||
          event.error.code === DashJSEvents.DOWNLOAD_INIT_SEGMENT_ERROR_CODE) &&
        mediaSources.availableSources().length > 1
      ) {
        return
      }

      if (event.error.code === DashJSEvents.DOWNLOAD_MANIFEST_ERROR_CODE) {
        manifestDownloadError(event.error);
        return
      }

      // It is possible audio could play back even if the video codec is not supported. Resetting here prevents this.
      if (event.error.code === DashJSEvents.UNSUPPORTED_CODEC) {
        mediaPlayer.reset();
      }
    }

    publishError(event.error);
  }

  function onGapJump({ seekTime, duration }) {
    DebugToolInstance.gap(seekTime - duration, seekTime);
  }

  function onQuotaExceeded(event) {
    // Note: criticalBufferLevel (Total buffered ranges * 0.8) is set BEFORE this event is triggered,
    // therefore it should actually be `criticalBufferLevel * 1.25` to see what the buffer size was on the device when this happened.
    const bufferLevel = event.criticalBufferLevel * 1.25;
    DebugToolInstance.quotaExceeded(bufferLevel, event.quotaExceededTime);
    Plugins.interface.onQuotaExceeded({ criticalBufferLevel: bufferLevel, quotaExceededTime: event.quotaExceededTime });
  }

  function manifestDownloadError(mediaError) {
    const error = () => publishError(mediaError);

    const failoverParams = {
      isBufferingTimeoutError: false,
      currentTime: getCurrentTime(),
      duration: getDuration(),
      code: mediaError.code,
      message: mediaError.message,
    };

    mediaSources.failover(load, error, failoverParams);
  }

  function onManifestLoaded(event) {
    DebugToolInstance.info(`Manifest loaded. Duration is: ${event.data.mediaPresentationDuration}`);

    if (event.data) {
      const manifest = event.data;
      const representationOptions = window.bigscreenPlayer.representationOptions || {};

      ManifestModifier.filter(manifest, representationOptions);
      ManifestModifier.generateBaseUrls(manifest, mediaSources.availableSources());

      emitManifestInfo(manifest);
    }
  }

  function emitManifestInfo(manifest) {
    Plugins.interface.onManifestLoaded(manifest);
  }

  function onManifestValidityChange(event) {
    DebugToolInstance.info(`Manifest validity changed. Duration is: ${event.newDuration}`);
    if (windowType === WindowTypes.GROWING) {
      mediaPlayer.refreshManifest((manifest) => {
        DebugToolInstance.info(`Manifest Refreshed. Duration is: ${manifest.mediaPresentationDuration}`);
      });
    }
  }

  function onStreamInitialised() {
    const setMseDuration = window.bigscreenPlayer.overrides && window.bigscreenPlayer.overrides.mseDurationOverride;
    if (setMseDuration && (windowType === WindowTypes.SLIDING || windowType === WindowTypes.GROWING)) {
      // Workaround for no setLiveSeekableRange/clearLiveSeekableRange
      mediaPlayer.setMediaDuration(Number.MAX_SAFE_INTEGER);
    }

    emitPlayerInfo();
  }

  function emitPlayerInfo() {
    playerMetadata.playbackBitrate =
      mediaKind === MediaKinds.VIDEO
        ? currentPlaybackBitrate(MediaKinds.VIDEO) + currentPlaybackBitrate(MediaKinds.AUDIO)
        : currentPlaybackBitrate(MediaKinds.AUDIO);

    DebugToolInstance.dynamicMetric("bitrate", playerMetadata.playbackBitrate);

    Plugins.interface.onPlayerInfoUpdated({
      bufferLength: playerMetadata.bufferLength,
      playbackBitrate: playerMetadata.playbackBitrate,
    });
  }

  function getBufferedRanges() {
    if (mediaPlayer == null) {
      return []
    }

    return mediaPlayer
      .getActiveStream()
      .getProcessors()
      .filter((processor) => processor.getType() === "audio" || processor.getType() === "video")
      .map((processor) => ({
        kind: processor.getType(),
        buffered: convertTimeRangesToArray(processor.getBuffer().getAllBufferRanges()),
      }))
  }

  function currentPlaybackBitrate(mediaKind) {
    const representationSwitch = mediaPlayer.getDashMetrics().getCurrentRepresentationSwitch(mediaKind);
    const representation = representationSwitch ? representationSwitch.to : "";
    return playbackBitrateForRepresentation(representation, mediaKind)
  }

  function playbackBitrateForRepresentation(representation, mediaKind) {
    const repIdx = mediaPlayer.getDashAdapter().getIndexForRepresentation(representation, 0);
    return playbackBitrateForRepresentationIndex(repIdx, mediaKind)
  }

  function playbackBitrateForRepresentationIndex(index, mediaKind) {
    if (index === -1) return ""

    const bitrateInfoList = mediaPlayer.getBitrateInfoListFor(mediaKind);
    return parseInt(bitrateInfoList[index].bitrate / 1000)
  }

  function onQualityChangeRendered(event) {
    function logBitrate(event) {
      const { mediaType, oldQuality, newQuality } = event;

      const oldBitrate = isNaN(oldQuality) ? "--" : playbackBitrateForRepresentationIndex(oldQuality, mediaType);
      const newBitrate = isNaN(newQuality) ? "--" : playbackBitrateForRepresentationIndex(newQuality, mediaType);

      const oldRepresentation = isNaN(oldQuality) ? "Start" : `${oldQuality} (${oldBitrate} kbps)`;
      const newRepresentation = `${newQuality} (${newBitrate} kbps)`;

      DebugToolInstance.dynamicMetric(`representation-${mediaType}`, [newQuality, newBitrate]);

      DebugToolInstance.info(
        `${mediaType} ABR Change Rendered From Representation ${oldRepresentation} To ${newRepresentation}`
      );
    }

    if (event.newQuality !== undefined) {
      logBitrate(event);
    }

    emitPlayerInfo();
    Plugins.interface.onQualityChangedRendered(event);
  }

  /**
   * Base url selected events are fired from dash.js whenever a priority weighted url is selected from a manifest
   * Note: we ignore the initial selection as it isn't a failover.
   * @param {*} event
   */
  function onBaseUrlSelected(event) {
    const failoverInfo = {
      isBufferingTimeoutError: false,
      code: lastError && lastError.code,
      message: lastError && lastError.message,
    };

    function log() {
      DebugToolInstance.info(`BaseUrl selected: ${event.baseUrl.url}`);
      lastError = undefined;
    }

    failoverInfo.serviceLocation = event.baseUrl.serviceLocation;
    mediaSources.failover(log, log, failoverInfo);
  }

  function onServiceLocationAvailable(event) {
    DebugToolInstance.info(`Service Location available: ${event.entry}`);
  }

  function onURLResolutionFailed() {
    DebugToolInstance.info("URL Resolution failed");
  }

  function onMetricAdded(event) {
    if (event.mediaType === "video" && event.metric === "DroppedFrames") {
      DebugToolInstance.staticMetric("frames-dropped", event.value.droppedFrames);
    }
    if (event.mediaType === mediaKind && event.metric === "BufferLevel") {
      dashMetrics = mediaPlayer.getDashMetrics();

      if (dashMetrics) {
        playerMetadata.bufferLength = dashMetrics.getCurrentBufferLevel(event.mediaType);
        DebugToolInstance.staticMetric("buffer-length", playerMetadata.bufferLength);
        Plugins.interface.onPlayerInfoUpdated({
          bufferLength: playerMetadata.bufferLength,
          playbackBitrate: playerMetadata.playbackBitrate,
        });
      }
    }
  }

  function onDebugLog(event) {
    DebugToolInstance.debug(event.message);
  }

  function onFragmentContentLengthMismatch(event) {
    DebugToolInstance.info(`Fragment Content Length Mismatch: ${event.responseUrl} (${event.mediaType})`);
    DebugToolInstance.info(`Header Length ${event.headerLength}`);
    DebugToolInstance.info(`Body Length ${event.bodyLength})`);
    Plugins.interface.onFragmentContentLengthMismatch(event);
  }

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

  function isPaused() {
    return mediaPlayer && mediaPlayer.isReady() ? mediaPlayer.isPaused() : undefined
  }

  function getClampedTime(time, range) {
    const isStatic = windowType === WindowTypes.STATIC;
    const isSliding = windowType === WindowTypes.SLIDING;
    const clampedRange = {
      start: isSliding ? 0 : range.start,
      end: isSliding ? mediaPlayer.getDVRWindowSize() : range.end,
      correction: isStatic ? seekDurationPadding : Math.max(liveDelay, seekDurationPadding),
    };

    return Math.min(Math.max(time, clampedRange.start), clampedRange.end - clampedRange.correction)
  }

  function load(mimeType, playbackTime) {
    if (mediaPlayer) {
      modifySource(refreshFailoverTime || failoverTime, failoverZeroPoint);
    } else {
      failoverTime = playbackTime;
      setUpMediaElement(playbackElement);
      setUpMediaPlayer(playbackTime);
      setUpMediaListeners();
    }
  }

  function setUpMediaElement(playbackElement) {
    mediaElement = mediaKind === MediaKinds.AUDIO ? document.createElement("audio") : document.createElement("video");

    mediaElement.style.position = "absolute";
    mediaElement.style.width = "100%";
    mediaElement.style.height = "100%";

    playbackElement.insertBefore(mediaElement, playbackElement.firstChild);
  }

  function getDashSettings(playerSettings) {
    const settings = Utils.deepClone(playerSettings);

    // BSP Specific Settings
    delete settings.failoverResetTime;
    delete settings.failoverSort;
    delete settings.streaming?.seekDurationPadding;

    return settings
  }

  function setUpMediaPlayer(playbackTime) {
    const dashSettings = getDashSettings(playerSettings);
    const dashSubs = window.bigscreenPlayer?.overrides?.dashSubtitles ?? false;

    mediaPlayer = MediaPlayer().create();
    mediaPlayer.updateSettings(dashSettings);
    mediaPlayer.initialize(mediaElement, null, true);

    if (dashSubs) {
      mediaPlayer.attachTTMLRenderingDiv(document.querySelector("#bsp_subtitles"));
    }

    modifySource(playbackTime);
  }

  function modifySource(playbackTime, zeroPoint) {
    const source = mediaSources.currentSource();
    const anchor = buildSourceAnchor(playbackTime, zeroPoint, {
      windowType,
      initialSeekableRangeStartSeconds: mediaSources.time().windowStartTime / 1000,
    });
    mediaPlayer.attachSource(`${source}${anchor}`);
  }

  function setUpMediaListeners() {
    DebugToolInstance.dynamicMetric("ended", mediaElement.ended);
    DebugToolInstance.dynamicMetric("paused", mediaElement.paused);
    DebugToolInstance.dynamicMetric("playback-rate", mediaElement.playbackRate);
    DebugToolInstance.dynamicMetric("ready-state", mediaElement.readyState);
    DebugToolInstance.dynamicMetric("seeking", mediaElement.seeking);

    mediaElement.addEventListener("timeupdate", onTimeUpdate);
    mediaElement.addEventListener("loadedmetadata", onLoadedMetaData);
    mediaElement.addEventListener("loadeddata", onLoadedData);
    mediaElement.addEventListener("play", onPlay);
    mediaElement.addEventListener("playing", onPlaying);
    mediaElement.addEventListener("pause", onPaused);
    mediaElement.addEventListener("waiting", onWaiting);
    mediaElement.addEventListener("seeking", onSeeking);
    mediaElement.addEventListener("seeked", onSeeked);
    mediaElement.addEventListener("ended", onEnded);
    mediaElement.addEventListener("ratechange", onRateChange);
    mediaPlayer.on(DashJSEvents.ERROR, onError);
    mediaPlayer.on(DashJSEvents.MANIFEST_LOADED, onManifestLoaded);
    mediaPlayer.on(DashJSEvents.STREAM_INITIALIZED, onStreamInitialised);
    mediaPlayer.on(DashJSEvents.MANIFEST_VALIDITY_CHANGED, onManifestValidityChange);
    mediaPlayer.on(DashJSEvents.QUALITY_CHANGE_RENDERED, onQualityChangeRendered);
    mediaPlayer.on(DashJSEvents.BASE_URL_SELECTED, onBaseUrlSelected);
    mediaPlayer.on(DashJSEvents.METRIC_ADDED, onMetricAdded);
    mediaPlayer.on(DashJSEvents.LOG, onDebugLog);
    mediaPlayer.on(DashJSEvents.SERVICE_LOCATION_AVAILABLE, onServiceLocationAvailable);
    mediaPlayer.on(DashJSEvents.URL_RESOLUTION_FAILED, onURLResolutionFailed);
    mediaPlayer.on(DashJSEvents.FRAGMENT_CONTENT_LENGTH_MISMATCH, onFragmentContentLengthMismatch);
    mediaPlayer.on(DashJSEvents.GAP_JUMP, onGapJump);
    mediaPlayer.on(DashJSEvents.GAP_JUMP_TO_END, onGapJump);
    mediaPlayer.on(DashJSEvents.QUOTA_EXCEEDED, onQuotaExceeded);
    mediaPlayer.on(DashJSEvents.TEXT_TRACKS_ADDED, disableTextTracks);
  }

  function disableTextTracks() {
    const textTracks = mediaElement.textTracks;
    for (let index = 0; index < textTracks.length; index++) {
      textTracks[index].mode = "disabled";
    }
  }

  function enableTextTracks() {
    const textTracks = mediaElement.textTracks;
    for (let index = 0; index < textTracks.length; index++) {
      textTracks[index].mode = "showing";
    }
  }

  function getSeekableRange() {
    if (mediaPlayer && mediaPlayer.isReady() && windowType !== WindowTypes.STATIC) {
      const dvrInfo = mediaPlayer.getDashMetrics().getCurrentDVRInfo(mediaKind);
      if (dvrInfo) {
        return {
          start: dvrInfo.range.start - timeCorrection,
          end: dvrInfo.range.end - timeCorrection - liveDelay,
        }
      }
    }

    return {
      start: 0,
      end: getDuration(),
    }
  }

  function getDuration() {
    return mediaPlayer && mediaPlayer.isReady() ? mediaPlayer.duration() : 0
  }

  function getCurrentTime() {
    return mediaElement ? mediaElement.currentTime - timeCorrection : 0
  }

  function refreshManifestBeforeSeek(seekToTime) {
    refreshFailoverTime = seekToTime;

    mediaPlayer.refreshManifest((manifest) => {
      const mediaPresentationDuration = manifest && manifest.mediaPresentationDuration;
      if (isNaN(mediaPresentationDuration)) {
        mediaPlayer.seek(seekToTime);
      } else {
        const clampedSeekTime = getClampedTime(seekToTime, {
          start: getSeekableRange().start,
          end: mediaPresentationDuration,
        });
        DebugToolInstance.info(`Stream ended. Clamping seek point to end of stream - seek point now: ${clampedSeekTime}`);
        mediaPlayer.seek(clampedSeekTime);
      }
    });
  }

  function calculateSeekOffset(time) {
    if (windowType !== WindowTypes.SLIDING) {
      return getClampedTime(time, getSeekableRange())
    }

    const dvrInfo = mediaPlayer.getDashMetrics().getCurrentDVRInfo(mediaKind);
    const offset = TimeUtils.calculateSlidingWindowSeekOffset(
      time,
      dvrInfo.range.start,
      timeCorrection,
      slidingWindowPausedTime
    );
    slidingWindowPausedTime = 0;

    return getClampedTime(offset)
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
      mediaPlayer.play
    );
  }

  return {
    transitions: {
      canBePaused: () => true,
      canBeginSeek: () => true,
    },
    addEventCallback,
    removeEventCallback,
    addErrorCallback: (thisArg, newErrorCallback) => {
      errorCallback = (event) => newErrorCallback.call(thisArg, event);
    },
    addTimeUpdateCallback: (thisArg, newTimeUpdateCallback) => {
      timeUpdateCallback = () => newTimeUpdateCallback.call(thisArg);
    },
    load,
    getSeekableRange,
    getCurrentTime,
    getDuration,
    setSubtitles: (state) => {
      if (state) {
        enableTextTracks();
      }
      mediaPlayer.enableText(state);
    },
    getPlayerElement: () => mediaElement,
    tearDown: () => {
      mediaPlayer.reset();

      mediaElement.removeEventListener("timeupdate", onTimeUpdate);
      mediaElement.removeEventListener("loadedmetadata", onLoadedMetaData);
      mediaElement.removeEventListener("loadeddata", onLoadedData);
      mediaElement.removeEventListener("play", onPlay);
      mediaElement.removeEventListener("playing", onPlaying);
      mediaElement.removeEventListener("pause", onPaused);
      mediaElement.removeEventListener("waiting", onWaiting);
      mediaElement.removeEventListener("seeking", onSeeking);
      mediaElement.removeEventListener("seeked", onSeeked);
      mediaElement.removeEventListener("ended", onEnded);
      mediaElement.removeEventListener("ratechange", onRateChange);
      mediaPlayer.off(DashJSEvents.ERROR, onError);
      mediaPlayer.off(DashJSEvents.MANIFEST_LOADED, onManifestLoaded);
      mediaPlayer.off(DashJSEvents.MANIFEST_VALIDITY_CHANGED, onManifestValidityChange);
      mediaPlayer.off(DashJSEvents.STREAM_INITIALIZED, onStreamInitialised);
      mediaPlayer.off(DashJSEvents.QUALITY_CHANGE_RENDERED, onQualityChangeRendered);
      mediaPlayer.off(DashJSEvents.METRIC_ADDED, onMetricAdded);
      mediaPlayer.off(DashJSEvents.BASE_URL_SELECTED, onBaseUrlSelected);
      mediaPlayer.off(DashJSEvents.LOG, onDebugLog);
      mediaPlayer.off(DashJSEvents.SERVICE_LOCATION_AVAILABLE, onServiceLocationAvailable);
      mediaPlayer.off(DashJSEvents.URL_RESOLUTION_FAILED, onURLResolutionFailed);
      mediaPlayer.off(DashJSEvents.GAP_JUMP, onGapJump);
      mediaPlayer.off(DashJSEvents.GAP_JUMP_TO_END, onGapJump);
      mediaPlayer.off(DashJSEvents.QUOTA_EXCEEDED, onQuotaExceeded);

      DOMHelpers.safeRemoveElement(mediaElement);

      lastError = undefined;
      mediaPlayer = undefined;
      mediaElement = undefined;
      eventCallbacks = [];
      errorCallback = undefined;
      timeUpdateCallback = undefined;
      timeCorrection = undefined;
      failoverTime = undefined;
      failoverZeroPoint = undefined;
      isEnded = undefined;
      dashMetrics = undefined;
      playerMetadata = {
        playbackBitrate: undefined,
        bufferLength: undefined,
        fragmentInfo: {
          requestTime: undefined,
          numDownloaded: undefined,
        },
      };
    },
    reset: () => {},
    isEnded: () => isEnded,
    isPaused,
    pause: (opts = {}) => {
      if (windowType === WindowTypes.SLIDING && opts.pauseTrigger === PauseTriggers.APP) {
        slidingWindowPausedTime = Date.now();
      }

      mediaPlayer.pause();
      if (opts.disableAutoResume !== true && windowType === WindowTypes.SLIDING) {
        startAutoResumeTimeout();
      }
    },
    play: () => mediaPlayer.play(),
    setCurrentTime: (time) => {
      publishedSeekEvent = false;
      isSeeking = true;
      const seekToTime = getClampedTime(time, getSeekableRange());
      if (windowType === WindowTypes.GROWING && seekToTime > getCurrentTime()) {
        refreshManifestBeforeSeek(seekToTime);
      } else {
        const seekTime = calculateSeekOffset(time);
        mediaPlayer.seek(seekTime);
      }
    },
    setPlaybackRate: (rate) => {
      mediaPlayer.setPlaybackRate(rate);
    },
    getPlaybackRate: () => mediaPlayer.getPlaybackRate(),
  }
}

MSEStrategy.getLiveSupport = () => LiveSupport.SEEKABLE;

export { MSEStrategy as default };
