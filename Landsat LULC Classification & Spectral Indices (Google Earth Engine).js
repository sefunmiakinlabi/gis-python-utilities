/*
 * Title:       Landsat LULC Classification & Spectral Indices (Google Earth Engine)
 * Description: Pre-processes Landsat 7 Collection 2 Level-2 surface reflectance
 *              imagery, computes NDVI, NDBI, and mNDWI alongside SRTM elevation,
 *              trains a Random Forest classifier (smileRandomForest) for 5 land
 *              cover classes, evaluates accuracy/feature importance, and exports
 *              GeoTIFF outputs in EPSG:32631.
 * Author:      Sefunmi Rebecca Akinlabi
 * Note:        Replace the placeholder `roi` geometry and sample training points
 *              with your study boundary and validated reference samples.
 */

// --- 1. DEFINE STUDY AREA (ROI) ---
// Replace with your own polygon/asset boundary around the study area (e.g., Akure)
var roi = ee.Geometry.Rectangle([5.08, 7.15, 5.30, 7.36]);

// Load elevation data (SRTM 30m)
var elevation = ee.Image('USGS/SRTMGL1_003').clip(roi).rename('elevation');

// --- 2. PRE-PROCESSING FUNCTION (LANDSAT 7 C2 SURFACE REFLECTANCE) ---
function prepSrL7(image) {
  // Mask unwanted pixels: fill, dilated cloud, cirrus/cloud, cloud shadow, snow
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply Collection 2 surface reflectance scaling factors
  var getFactorImg = function(factorNames) {
    var factorList = image.toDictionary().select(factorNames).values();
    return ee.Image.constant(factorList);
  };

  var scaleImg = getFactorImg(['REFLECTANCE_MULT_BAND_.']);
  var offsetImg = getFactorImg(['REFLECTANCE_ADD_BAND_.']);
  var scaled = image.select('SR_B.').multiply(scaleImg).add(offsetImg);

  return image.addBands(scaled, null, true)
    .updateMask(qaMask)
    .updateMask(saturationMask);
}

// --- 3. BUILD COMPOSITE & DERIVE SPECTRAL INDICES (2002) ---
var composite = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .filterDate('2002-01-01', '2002-12-31')
  .filterBounds(roi)
  .map(prepSrL7)
  .select('SR_B[1-57]')
  .median();

var visualization = {
  bands: ['SR_B5', 'SR_B4', 'SR_B2'],
  min: 0.0,
  max: 0.3
};

Map.setCenter(5.1963, 7.2571, 10);

// Spectral indices (Landsat 7 bands: B2=Green, B3=Red, B4=NIR, B5=SWIR1)
var ndvi = composite.normalizedDifference(['SR_B4', 'SR_B3']).rename('ndvi');
var ndbi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('ndbi');
var mndwi = composite.normalizedDifference(['SR_B2', 'SR_B5']).rename('mndwi');

var composites = composite
  .addBands(ndvi)
  .addBands(ndbi)
  .addBands(mndwi)
  .addBands(elevation)
  .clip(roi);

Map.addLayer(composites, visualization, 'Image Composite (2002)');

// --- 4. TRAINING SAMPLES (PLACEHOLDER EXAMPLES) ---
// Classes: 1=Built-up, 2=Agricultural, 3=Vegetation, 4=Bareland, 5=Water
// Replace/expand with comprehensive reference points for reliable accuracy
var Builtup = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([5.1963, 7.2571]), {'landcover': 1}),
  ee.Feature(ee.Geometry.Point([5.2000, 7.2500]), {'landcover': 1})
]);

var Agricultural = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([5.1800, 7.2400]), {'landcover': 2}),
  ee.Feature(ee.Geometry.Point([5.1900, 7.2300]), {'landcover': 2})
]);

var Vegetation = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([5.1700, 7.2200]), {'landcover': 3}),
  ee.Feature(ee.Geometry.Point([5.1600, 7.2100]), {'landcover': 3})
]);

var Bareland = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([5.1500, 7.2000]), {'landcover': 4}),
  ee.Feature(ee.Geometry.Point([5.1400, 7.1900]), {'landcover': 4})
]);

var Water = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([5.1300, 7.1800]), {'landcover': 5}),
  ee.Feature(ee.Geometry.Point([5.1200, 7.1700]), {'landcover': 5})
]);

var newfc = Builtup
  .merge(Agricultural)
  .merge(Vegetation)
  .merge(Bareland)
  .merge(Water);

var featureBands = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'ndvi', 'ndbi', 'mndwi', 'elevation'];

var points = composites.select(featureBands).sampleRegions({
  collection: newfc,
  properties: ['landcover'],
  scale: 30
}).randomColumn();

// 80% training / 20% validation split
var split = 0.8;
var training = points.filter(ee.Filter.lt('random', split));
var testing = points.filter(ee.Filter.gte('random', split));

print('Total samples n =', points.size());
print('Training samples n =', training.size());
print('Testing samples n =', testing.size());

if (training.size().getInfo() < 10) {
  print('WARNING: Very few training samples. Add more reference points before interpreting results.');
}

// --- 5. RANDOM FOREST CLASSIFICATION & ACCURACY ASSESSMENT ---
var classifier = ee.Classifier.smileRandomForest(500).train({
  features: training,
  classProperty: 'landcover',
  inputProperties: featureBands
});

var confusionMatrix = classifier.confusionMatrix();
print('Training Confusion Matrix:', confusionMatrix);
print('Training Overall Accuracy:', confusionMatrix.accuracy());
print('Training Kappa:', confusionMatrix.kappa());

var validation = testing.classify(classifier);
var testAccuracy = validation.errorMatrix('landcover', 'classification');
print('Validation Error Matrix:', testAccuracy);
print('Validation Overall Accuracy:', testAccuracy.accuracy());
print('Validation Kappa:', testAccuracy.kappa());

var classified = composites.classify(classifier);

Map.addLayer(classified, {
  min: 1,
  max: 5,
  palette: ['ff0000', 'ffff00', '00ff00', 'a0522d', '0000ff']
}, 'Land Cover Classification (2002)');

// --- 6. VARIABLE IMPORTANCE ---
var importance = ee.Dictionary(classifier.explain().get('importance'));
var sumImportance = importance.values().reduce(ee.Reducer.sum());
var relativeImportance = importance.map(function(key, value) {
  return ee.Number(value).multiply(100).divide(sumImportance);
});

print('Relative Importance (%):', relativeImportance);

var importanceFc = ee.FeatureCollection([ee.Feature(null, relativeImportance)]);
var chart = ui.Chart.feature.byProperty({
  features: importanceFc
}).setOptions({
  title: 'Relative Feature Importance for LULC Classification',
  vAxis: {title: 'Importance (%)'},
  hAxis: {title: 'Features'},
  legend: {position: 'none'}
});
print(chart);

// --- 7. EXPORT RESULTS TO GOOGLE DRIVE ---
Export.image.toDrive({
  image: classified.toInt16(),
  description: 'Akure_LULC_2002',
  region: roi,
  folder: 'GEE_Akure',
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

var ndviForExport = ndvi.clip(roi);
Map.addLayer(ndviForExport, {
  min: -1,
  max: 1,
  palette: ['red', 'yellow', 'green']
}, 'NDVI (2002)');

Export.image.toDrive({
  image: ndviForExport.toFloat(),
  description: 'NDVI_Akure_2002',
  region: roi,
  folder: 'GEE_Akure',
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

print('Script setup complete.');