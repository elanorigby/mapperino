#!/usr/bin/env python3
"""
Extract street segments for the London Borough of Brent from OpenStreetMap.

This script:
1. Downloads road network data from OSM for Brent
2. Identifies all intersection nodes
3. Splits roads into segments between intersections
4. Exports segments as GeoJSON with default red color
"""

import osmnx as ox
import geopandas as gpd
import json
import sys
from pathlib import Path
from shapely.geometry import LineString, Point
import networkx as nx


def get_brent_road_network():
    """Download the road network for London Borough of Brent."""
    print("Downloading road network for London Borough of Brent...")

    # Download the street network for Brent
    # network_type='all' gets all road types including residential
    graph = ox.graph_from_place(
        "London Borough of Brent, United Kingdom",
        network_type='all'
    )

    print(f"Downloaded graph with {len(graph.nodes)} nodes and {len(graph.edges)} edges")
    return graph


def graph_to_segments(graph):
    """
    Convert the OSMnx graph into individual segments.

    Each segment is a portion of road between two intersection nodes.
    OSMnx already handles this - each edge in the graph is a segment!
    """
    print("Converting graph to segments...")

    segments = []
    segment_id = 0

    for u, v, key, data in graph.edges(keys=True, data=True):
        # Get the geometry of this edge
        if 'geometry' in data:
            # If the edge has a geometry, use it
            geometry = data['geometry']
        else:
            # Otherwise create a straight line between the two nodes
            start_node = graph.nodes[u]
            end_node = graph.nodes[v]
            geometry = LineString([
                (start_node['x'], start_node['y']),
                (end_node['x'], end_node['y'])
            ])

        # Create a segment feature
        segment = {
            'type': 'Feature',
            'properties': {
                'id': f'segment_{segment_id}',
                'color': '#FF0000',  # Default red color
                'osm_id': data.get('osmid', None),
                'name': data.get('name', 'Unnamed'),
                'highway': data.get('highway', 'unknown'),
            },
            'geometry': {
                'type': 'LineString',
                'coordinates': list(geometry.coords)
            }
        }

        segments.append(segment)
        segment_id += 1

    print(f"Created {len(segments)} segments")
    return segments


def save_geojson(segments, output_path):
    """Save segments to a GeoJSON file."""
    print(f"Saving to {output_path}...")

    geojson = {
        'type': 'FeatureCollection',
        'features': segments
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"Successfully saved {len(segments)} segments to {output_path}")


def main():
    """Main processing pipeline."""
    print("=" * 60)
    print("Brent Street Segment Processor")
    print("=" * 60)

    # Step 1: Get the road network
    graph = get_brent_road_network()

    # Step 2: Convert to segments
    segments = graph_to_segments(graph)

    # Step 3: Save to file
    output_path = Path(__file__).parent.parent / 'output' / 'brent_segments.geojson'
    save_geojson(segments, output_path)

    print("=" * 60)
    print("Processing complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
