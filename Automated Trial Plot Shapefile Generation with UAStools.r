# ==============================================================================
# Title:       Automated Trial Plot Shapefile Generation with UAStools
# Description: Sets up R 4.3.3 for legacy rgdal/UAStools compatibility, tests
#              plotshpcreate() on sample data, and generates rotated plot
#              polygons for a 176-plot field grid (4 columns x 44 rows).
# Notes:       - rgdal requires R 4.3.3 (retired from CRAN in Oct 2023).
#              - Plot dimensions/spacing arguments use feet (meters * 3.28084).
#              - Set UTMzone to match your study site (UTM Zone 31 for Ibadan).
# ==============================================================================

# --- PHASE 1 & 2: Environment & Legacy rgdal Setup (R 4.3.3) -----------------
# Confirm R version (expected: R version 4.3.3)
R.version.string

# Install and load required packages (if not already installed)
# Note: If prompted for binary vs. source, enter 'n'; if prompted for a
# numbered update menu, enter '3' to skip updates.
# install.packages("fs")
# install.packages("devtools")
# install.packages("rgdal")

library(devtools)
library(rgdal)

# Install UAStools from GitHub and load package
# devtools::install_github("andersst91/UAStools")
library(UAStools)

# View function documentation
?plotshpcreate

# --- PHASE 3: Test Run with Sample Data ---------------------------------------
# Create unique barcodes in SampleInfile
SampleInfile$Barcode <- paste(
  SampleInfile$Loc, "-",
  SampleInfile$Test, "-",
  SampleInfile$Range, "_",
  SampleInfile$Row,
  sep = ""
)

# Set working directory and verify
setwd("C:/Temp")
getwd()

# Run sample test
plotshpcreate(
  A = c(746374.266, 3382152.489),
  B = c(746476.259, 3382265.951),
  infile = SampleInfile,
  outfile = "test_output",
  nrowplot = 1,
  field = "CS17-G2FE"
)

# Check generated shapefiles and PDF previews
list.files("C:/Temp")

# --- PHASE 4: Field Application (176 Plots: 4 Columns x 44 Rows) --------------
myinfile <- expand.grid(
  Row = 1:4,     # 4 columns (left to right)
  Range = 1:44   # 44 rows (top to bottom)
)
myinfile$Plot <- 1:nrow(myinfile)
myinfile$Barcode <- paste0("biossa-", myinfile$Plot)

nrow(myinfile)
head(myinfile)

# Initial run (dimensions converted from meters to feet: m * 3.28084)
plotshpcreate(
  A = c(599684.49, 827636.01),
  B = c(599850.94, 827713.68),
  infile = myinfile,
  outfile = "biossa_plots",
  nrowplot = 1,
  field = "biossa",
  rowspc = 4.82,     # 1.47 m in feet
  rangespc = 74.8,   # 22.8 m in feet
  rangebuf = 2.39,   # Half alley width in feet (1.46 m / 2 * 3.28084)
  UTMzone = 31       # UTM Zone 31 (Ibadan, Nigeria)
)

list.files("C:/Temp", pattern = "biossa")

# Optional: Open generated PDF previews on Windows
# shell.exec("C:/Temp/biossa_biossa_plots_Square_plots.pdf")
# shell.exec("C:/Temp/biossa_biossa_plots_Rotated_plots.pdf")

# Refined run after inspecting plot geometry in ArcGIS Pro
plotshpcreate(
  A = c(599684.49, 827636.01),
  B = c(599850.94, 827713.68),
  infile = myinfile,
  outfile = "biossa_plots2",
  nrowplot = 1,
  field = "biossa",
  rowspc = 13.71,    # 4.18 m plot width in feet
  rangespc = 18.41,  # 5.61 m plot length in feet
  rangebuf = 2.51,   # Half distance between centers in feet
  UTMzone = 31
)