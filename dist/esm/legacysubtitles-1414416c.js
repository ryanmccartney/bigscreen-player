import { D as DOMHelpers, a as DebugToolInstance, P as Plugins, L as LoadUrl, T as TransportControlPosition } from './main-650cde29.js';

/**
 * Safely checks if an attribute exists on an element.
 * Browsers < DOM Level 2 do not have 'hasAttribute'
 *
 * The interesting case - can be null when it isn't there or "", but then can also return "" when there is an attribute with no value.
 * For subs this is good enough. There should not be attributes without values.
 * @param {Element} el HTML Element
 * @param {String} attribute attribute to check for
 */
function hasAttribute(el, attribute) {
  return !!el.getAttribute(attribute)
}

function hasNestedTime(element) {
  return !hasAttribute(element, "begin") || !hasAttribute(element, "end")
}

function TimedText(timedPieceNode, toStyleFunc) {
  const start = timeStampToSeconds(timedPieceNode.getAttribute("begin"));
  const end = timeStampToSeconds(timedPieceNode.getAttribute("end"));
  const _node = timedPieceNode;
  let htmlElementNode;

  function timeStampToSeconds(timeStamp) {
    const timePieces = timeStamp.split(":");
    let timeSeconds = parseFloat(timePieces.pop(), 10);
    if (timePieces.length) {
      timeSeconds += 60 * parseInt(timePieces.pop(), 10);
    }
    if (timePieces.length) {
      timeSeconds += 60 * 60 * parseInt(timePieces.pop(), 10);
    }
    return timeSeconds
  }

  function removeFromDomIfExpired(time) {
    if (time > end || time < start) {
      DOMHelpers.safeRemoveElement(htmlElementNode);
      return true
    }
    return false
  }

  function addToDom(parentNode) {
    const node = htmlElementNode || generateHtmlElementNode();
    parentNode.appendChild(node);
  }

  function generateHtmlElementNode(node) {
    const source = node || _node;
    let localName = source.localName || source.tagName;

    // We lose line breaks with nested TimePieces, so this provides similar layout
    const parentNodeLocalName =
      (source.parentNode && source.parentNode.localName) || (source.parentNode && source.parentNode.tagName);
    if (localName === "span" && parentNodeLocalName === "p" && hasNestedTime(source.parentNode)) {
      localName = "p";
    }

    const html = document.createElement(localName);
    const style = toStyleFunc(source);
    if (style) {
      html.setAttribute("style", style);
      html.style.cssText = style;
    }

    if (localName === "p") {
      html.style.margin = "0px";
    }

    for (let i = 0, j = source.childNodes.length; i < j; i++) {
      const n = source.childNodes[i];
      if (n.nodeType === 3) {
        html.appendChild(document.createTextNode(n.data));
      } else if (n.nodeType === 1) {
        html.appendChild(generateHtmlElementNode(n));
      }
    }
    if (!node) {
      htmlElementNode = html;
    }

    return html
  }

  return {
    start: start,
    end: end,
    // TODO: can we stop this from adding/removing itself from the DOM? Just expose the 'generateNode' function? OR just generate the node at creation and have a property...
    removeFromDomIfExpired: removeFromDomIfExpired,
    addToDom: addToDom,
  }
}

function Transformer() {
  const _styles = {};
  const elementToStyleMap = [
    {
      attribute: "tts:color",
      property: "color",
    },
    {
      attribute: "tts:backgroundColor",
      property: "text-shadow",
    },
    {
      attribute: "tts:fontStyle",
      property: "font-style",
    },
    {
      attribute: "tts:textAlign",
      property: "text-align",
    },
  ];

  /**
   * Safely checks if an attribute exists on an element.
   * Browsers < DOM Level 2 do not have 'hasAttribute'
   *
   * The interesting case - can be null when it isn't there or "", but then can also return "" when there is an attribute with no value.
   * For subs this is good enough. There should not be attributes without values.
   * @param {Element} el HTML Element
   * @param {String} attribute attribute to check for
   */
  const hasAttribute = (el, attribute) => !!el.getAttribute(attribute);

  function hasNestedTime(element) {
    return !hasAttribute(element, "begin") || !hasAttribute(element, "end")
  }

  function isEBUDistribution(metadata) {
    return metadata === "urn:ebu:tt:distribution:2014-01" || metadata === "urn:ebu:tt:distribution:2018-04"
  }

  function rgbWithOpacity(value) {
    if (DOMHelpers.isRGBA(value)) {
      let opacity = parseInt(value.slice(7, 9), 16) / 255;

      if (isNaN(opacity)) {
        opacity = 1.0;
      }

      value = DOMHelpers.rgbaToRGB(value);
      value += "; opacity: " + opacity + ";";
    }
    return value
  }

  function elementToStyle(el) {
    const styles = _styles;
    const inherit = el.getAttribute("style");
    let stringStyle = "";

    if (inherit) {
      if (styles[inherit]) {
        stringStyle = styles[inherit];
      } else {
        return false
      }
    }

    for (let i = 0, j = elementToStyleMap.length; i < j; i++) {
      const map = elementToStyleMap[i];
      let value = el.getAttribute(map.attribute);

      if (value === null || value === undefined) {
        continue
      }

      if (map.conversion) {
        value = map.conversion(value);
      }

      if (map.attribute === "tts:backgroundColor") {
        value = rgbWithOpacity(value);
        value += " 2px 2px 1px";
      }

      if (map.attribute === "tts:color") {
        value = rgbWithOpacity(value);
      }

      stringStyle += map.property + ": " + value + "; ";
    }

    return stringStyle
  }

  function transformXML(xml) {
    try {
      // Use .getElementsByTagNameNS() when parsing XML as some implementations of .getElementsByTagName() will lowercase its argument before proceding
      const conformsToStandardElements = Array.prototype.slice.call(
        xml.getElementsByTagNameNS("urn:ebu:tt:metadata", "conformsToStandard")
      );
      const isEBUTTD =
        conformsToStandardElements && conformsToStandardElements.some((node) => isEBUDistribution(node.textContent));

      const captionValues = {
        ttml: {
          namespace: "http://www.w3.org/2006/10/ttaf1",
          idAttribute: "id",
        },
        ebuttd: {
          namespace: "http://www.w3.org/ns/ttml",
          idAttribute: "xml:id",
        },
      };

      const captionStandard = isEBUTTD ? captionValues.ebuttd : captionValues.ttml;
      const styles = _styles;
      const styleElements = xml.getElementsByTagNameNS(captionStandard.namespace, "style");

      for (let i = 0; i < styleElements.length; i++) {
        const se = styleElements[i];
        const id = se.getAttribute(captionStandard.idAttribute);
        const style = elementToStyle(se);

        if (style) {
          styles[id] = style;
        }
      }

      const body = xml.getElementsByTagNameNS(captionStandard.namespace, "body")[0];
      const s = elementToStyle(body);
      const ps = xml.getElementsByTagNameNS(captionStandard.namespace, "p");
      const items = [];

      for (let k = 0, m = ps.length; k < m; k++) {
        if (hasNestedTime(ps[k])) {
          const tag = ps[k];
          for (let index = 0; index < tag.childNodes.length; index++) {
            if (hasAttribute(tag.childNodes[index], "begin") && hasAttribute(tag.childNodes[index], "end")) {
              // TODO: rather than pass a function, can't we make timedText look after it's style from this point?
              items.push(TimedText(tag.childNodes[index], elementToStyle));
            }
          }
        } else {
          items.push(TimedText(ps[k], elementToStyle));
        }
      }

      return {
        baseStyle: s,
        subtitlesForTime: (time) => items.filter((subtitle) => subtitle.start < time && subtitle.end > time),
      }
    } catch (e) {
      DebugToolInstance.info("Error transforming captions : " + e);
      Plugins.interface.onSubtitlesTransformError();
    }
  }

  return {
    transformXML: transformXML,
  }
}

function Renderer(id, captionsXML, mediaPlayer) {
  let transformedSubtitles;
  let liveItems = [];
  let interval = 0;
  let outputElement;

  outputElement = document.createElement("div");
  outputElement.id = id;

  transformedSubtitles = Transformer().transformXML(captionsXML);

  start();

  function render() {
    return outputElement
  }

  function start() {
    if (transformedSubtitles) {
      interval = setInterval(() => update(), 750);
      if (outputElement) {
        outputElement.setAttribute("style", transformedSubtitles.baseStyle);
        outputElement.style.cssText = transformedSubtitles.baseStyle;
        outputElement.style.display = "block";
      }
    }
  }

  function stop() {
    if (outputElement) {
      outputElement.style.display = "none";
    }

    cleanOldCaptions(mediaPlayer.getDuration());
    clearInterval(interval);
  }

  function update() {
    try {
      if (!mediaPlayer) {
        stop();
      }

      const time = mediaPlayer.getCurrentTime();
      updateCaptions(time);

      confirmCaptionsRendered();
    } catch (e) {
      DebugToolInstance.info("Exception while rendering subtitles: " + e);
      Plugins.interface.onSubtitlesRenderError();
    }
  }

  function confirmCaptionsRendered() {
    if (outputElement && !outputElement.hasChildNodes() && liveItems.length > 0) {
      Plugins.interface.onSubtitlesRenderError();
    }
  }

  function updateCaptions(time) {
    cleanOldCaptions(time);
    addNewCaptions(time);
  }

  function cleanOldCaptions(time) {
    const live = liveItems;
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].removeFromDomIfExpired(time)) {
        live.splice(i, 1);
      }
    }
  }

  function addNewCaptions(time) {
    const live = liveItems;
    const fresh = transformedSubtitles.subtitlesForTime(time);
    liveItems = live.concat(fresh);
    for (let i = 0, j = fresh.length; i < j; i++) {
      // TODO: Probably start adding to the DOM here rather than calling through.
      fresh[i].addToDom(outputElement);
    }
  }

  return {
    render: render,
    start: start,
    stop: stop,
  }
}

function LegacySubtitles(mediaPlayer, autoStart, parentElement, mediaSources) {
  const container = document.createElement("div");
  let subtitlesRenderer;

  if (autoStart) {
    start();
  }

  function loadSubtitles() {
    const url = mediaSources.currentSubtitlesSource();

    if (url && url !== "") {
      LoadUrl(url, {
        timeout: mediaSources.subtitlesRequestTimeout(),
        onLoad: (responseXML) => {
          if (responseXML) {
            createContainer(responseXML);
          } else {
            DebugToolInstance.info("Error: responseXML is invalid.");
            Plugins.interface.onSubtitlesXMLError({ cdn: mediaSources.currentSubtitlesCdn() });
          }
        },
        onError: ({ statusCode, ...rest } = {}) => {
          const errorCase = () => {
            DebugToolInstance.info("Failed to load from subtitles file from all available CDNs");
          };
          DebugToolInstance.info(`Error loading subtitles data: ${statusCode}`);
          mediaSources.failoverSubtitles(loadSubtitles, errorCase, { statusCode, ...rest });
        },
        onTimeout: () => {
          DebugToolInstance.info("Request timeout loading subtitles");
          Plugins.interface.onSubtitlesTimeout({ cdn: mediaSources.currentSubtitlesCdn() });
        },
      });
    }
  }

  function createContainer(xml) {
    container.id = "playerCaptionsContainer";
    DOMHelpers.addClass(container, "playerCaptions");

    const videoHeight = parentElement.clientHeight;

    container.style.position = "absolute";
    container.style.bottom = "0px";
    container.style.right = "0px";
    container.style.fontWeight = "bold";
    container.style.textAlign = "center";
    container.style.textShadow = "#161616 2px 2px 1px";
    container.style.color = "#ebebeb";

    if (videoHeight === 1080) {
      container.style.width = "1824px";
      container.style.fontSize = "63px";
      container.style.paddingRight = "48px";
      container.style.paddingLeft = "48px";
      container.style.paddingBottom = "60px";
    } else {
      // Assume 720 if not 1080. Styling implementation could be cleaner, but this is a quick fix for legacy subtitles
      container.style.width = "1216px";
      container.style.fontSize = "42px";
      container.style.paddingRight = "32px";
      container.style.paddingLeft = "32px";
      container.style.paddingBottom = "40px";
    }

    // TODO: We don't need this extra Div really... can we get rid of render() and use the passed in container?
    subtitlesRenderer = Renderer("playerCaptions", xml, mediaPlayer);
    container.appendChild(subtitlesRenderer.render());

    parentElement.appendChild(container);
  }

  function start() {
    if (subtitlesRenderer) {
      subtitlesRenderer.start();
    } else {
      loadSubtitles();
    }
  }

  function stop() {
    if (subtitlesRenderer) {
      subtitlesRenderer.stop();
    }
  }

  function updatePosition(transportControlPosition) {
    const classes = {
      controlsVisible: TransportControlPosition.CONTROLS_ONLY,
      controlsWithInfoVisible: TransportControlPosition.CONTROLS_WITH_INFO,
      leftCarouselVisible: TransportControlPosition.LEFT_CAROUSEL,
      bottomCarouselVisible: TransportControlPosition.BOTTOM_CAROUSEL,
    };

    for (const cssClassName in classes) {
      // eslint-disable-next-line no-prototype-builtins
      if (classes.hasOwnProperty(cssClassName)) {
        // Allow multiple flags to be set at once
        if ((classes[cssClassName] & transportControlPosition) === classes[cssClassName]) {
          DOMHelpers.addClass(container, cssClassName);
        } else {
          DOMHelpers.removeClass(container, cssClassName);
        }
      }
    }
  }

  function tearDown() {
    stop();
    DOMHelpers.safeRemoveElement(container);
  }

  return {
    start,
    stop,
    updatePosition,
    customise: () => {},
    renderExample: () => {},
    clearExample: () => {},
    tearDown,
  }
}

export { LegacySubtitles as default };
