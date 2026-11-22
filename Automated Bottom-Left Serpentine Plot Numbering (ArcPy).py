"""
Title:       Automated Bottom-Left Serpentine Plot Numbering (ArcPy)
Description: Dynamically calculates the rotation angle of an agricultural trial
             grid, transforms polygon centroids along-track and across-track,
             and assigns sequential serpentine (snaking) plot IDs starting
             strictly from the bottom-left corner.
Author:      Sefunmi Rebecca Akinlabi
Environment: ArcGIS Pro / Python 3 (arcpy)
"""

import arcpy
import math


def auto_number_bottom_left_serpentine(
    workspace,
    layer_name,
    field_name,
    start_id=1,
    plots_per_row=8,
):
    """
    Numbers a rotated polygon grid starting strictly from the BOTTOM-LEFT corner,
    moving left-to-right on row 1, then snaking back right-to-left on row 2.

    Parameters:
        workspace (str): Path to geodatabase or "current" inside ArcGIS Pro.
        layer_name (str): Name or path of the polygon plot layer.
        field_name (str): Target LONG integer field for sequential IDs.
        start_id (int): Starting sequence number (default: 1).
        plots_per_row (int): Number of plots across each row (default: 8).
    """
    arcpy.env.workspace = workspace
    arcpy.env.overwriteOutput = True

    # 1. Verify or create target LONG integer field
    fields = [f.name for f in arcpy.ListFields(layer_name)]
    if field_name not in fields:
        try:
            arcpy.management.AddField(
                layer_name, field_name, "LONG", field_alias=field_name
            )
            print(f"Created new field: {field_name}")
        except arcpy.ExecuteError:
            print("Schema lock encountered while trying to add the field automatically.")
            print(
                f"Please add the '{field_name}' field manually as a LONG integer in "
                "ArcGIS Pro, close the attribute table, and re-run."
            )
            return

    # 2. Extract feature OIDs and centroid coordinates
    feature_list = []
    with arcpy.da.SearchCursor(layer_name, ["OID@", "SHAPE@XY"]) as s_cursor:
        for row in s_cursor:
            feature_list.append((row[0], row[1][0], row[1][1]))

    if not feature_list:
        print(f"No features found in layer: {layer_name}")
        return

    # 3. Calculate the rotation angle of the grid dynamically
    sorted_by_y = sorted(feature_list, key=lambda k: k[2])
    bottom_plot = sorted_by_y[0]
    top_plot = sorted_by_y[-1]

    dx = top_plot[1] - bottom_plot[1]
    dy = top_plot[2] - bottom_plot[2]
    angle = math.atan2(dy, dx)

    # 4. Transform coordinates relative to the field's tilt
    transformed_features = []
    for oid, x, y in feature_list:
        along_track = x * math.cos(angle) + y * math.sin(angle)
        across_track = -x * math.sin(angle) + y * math.cos(angle)
        transformed_features.append((oid, along_track, across_track))

    # 5. Sort plots primarily by their position UP the strip (along_track)
    transformed_features.sort(key=lambda k: k[1])

    # 6. Group into rows and apply strict bottom-left serpentine sorting
    final_sorted_oids = []
    row_count = 0

    for i in range(0, len(transformed_features), plots_per_row):
        row_chunk = transformed_features[i : i + plots_per_row]
        if row_count % 2 == 0:
            row_chunk.sort(key=lambda k: k[2])
        else:
            row_chunk.sort(key=lambda k: k[2], reverse=True)

        for item in row_chunk:
            final_sorted_oids.append(item[0])
        row_count += 1

    # Verify that the first plot corresponds to the true westernmost/bottom-left feature
    oid_to_x = {f[0]: f[1] for f in feature_list}
    first_row_plots = transformed_features[0:plots_per_row]
    raw_bottom_left_oid = min(first_row_plots, key=lambda k: oid_to_x[k[0]])[0]

    if final_sorted_oids[0] != raw_bottom_left_oid:
        final_sorted_oids = []
        row_count = 0
        for i in range(0, len(transformed_features), plots_per_row):
            row_chunk = transformed_features[i : i + plots_per_row]
            if row_count % 2 == 0:
                row_chunk.sort(key=lambda k: k[2], reverse=True)
            else:
                row_chunk.sort(key=lambda k: k[2])

            for item in row_chunk:
                final_sorted_oids.append(item[0])
            row_count += 1

    # 7. Create the ID mapping dictionary
    id_mapping = {oid: start_id + idx for idx, oid in enumerate(final_sorted_oids)}

    # 8. Write sequential IDs back to the attribute table
    with arcpy.da.UpdateCursor(layer_name, ["OID@", field_name]) as u_cursor:
        for row in u_cursor:
            oid = row[0]
            if oid in id_mapping:
                row[1] = id_mapping[oid]
                u_cursor.updateRow(row)

    print(
        f"Successfully numbered {len(id_mapping)} plots for '{layer_name}' "
        "starting from the BOTTOM-LEFT."
    )


# --- CONFIGURATION ---
if __name__ == "__main__":
    GDB_WORKSPACE = "current"
    POLYGON_LAYER = "AVT4_Ikenne"
    TARGET_FIELD = "SequenceID"
    PLOTS_PER_ROW = 8

    auto_number_bottom_left_serpentine(
        GDB_WORKSPACE,
        POLYGON_LAYER,
        TARGET_FIELD,
        start_id=1,
        plots_per_row=PLOTS_PER_ROW,
    )