/**
 * Places — the MAP tab's logic, without the map itself (js/map.js draws
 * it): positions on the map, the offline city and region lists, finding
 * places by name, and revealing them (state.map, see js/state.js).
 * Nothing here touches the page, so the tests run it in Node.
 */
(function(ST){
  'use strict';

  var clamp = ST.clamp;

  // ---------- positions ----------
  // The map is Web Mercator: a point's place on the whole world, from 0 to
  // 1 across (x) and down (y). Times the world's width in pixels at a zoom
  // (256 * 2^zoom), that's its pixel on the map.
  var MAX_LAT = 85.0511287798;
  var EARTH_M = 40075016.686;             // the equator's length, in metres
  function mercX(lon){ return (lon+180)/360; }
  function mercY(lat){
    var s = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT)*Math.PI/180);
    return 0.5 - Math.log((1+s)/(1-s))/(4*Math.PI);
  }
  // How many pixels a metre is at latitude `lat`, on a map `worldPx` wide:
  // the same everywhere at the equator, more towards the poles.
  function pixelsPerMetre(lat, worldPx){
    return worldPx / (EARTH_M*Math.cos(clamp(lat, -MAX_LAT, MAX_LAT)*Math.PI/180));
  }
  // Metres between two points (great circle).
  function distance(lat1, lon1, lat2, lon2){
    var r = Math.PI/180;
    var a = Math.pow(Math.sin((lat2-lat1)*r/2), 2) +
      Math.cos(lat1*r)*Math.cos(lat2*r)*Math.pow(Math.sin((lon2-lon1)*r/2), 2);
    return 2*6371008.8*Math.asin(Math.min(1, Math.sqrt(a)));
  }

  ST.places = {
    MAX_LAT: MAX_LAT,
    mercX: mercX,
    mercY: mercY,
    pixelsPerMetre: pixelsPerMetre,
    distance: distance
  };
})(window.StatusTerminal);
