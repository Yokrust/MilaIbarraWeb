"""
Medalla Firma — procedural model for the 3D configurator.

Run headless (rebuilds the .blend and the .glb from scratch):

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python 3d-assets/medalla-firma/build_medalla.py

Output (next to this script):
    medalla-firma.blend   — editable source
    medalla-firma.raw.glb — uncompressed export

Then compress it with meshopt (its decoder is bundled into the configurator,
so no external wasm/CDN is needed, unlike Draco):

    cd configurator && npm run build:model   →  theme/assets/medalla-firma.glb

Object names are a contract with configurator/src (do not rename):
    Medalla_Cuerpo   disc body with rounded rim (metal)
    Medalla_Cara     front engraving surface, planar UV 0..1 across the disc
    Medalla_Reverso  back surface, planar UV (reserved for phase 2)
    Argolla          jump ring + bail
    Cadena           cable chain, two strands rising from the bail

Units: meters (glTF). Disc Ø 18 mm, 1.4 mm thick — a typical small medal.
Dimensions are placeholders until the client confirms the real piece.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND_PATH = os.path.join(HERE, "medalla-firma.blend")
GLB_PATH = os.path.join(HERE, "medalla-firma.raw.glb")

MM = 0.001
DISC_RADIUS = 9.0 * MM
DISC_DEPTH = 1.4 * MM
RIM_BEVEL = 0.45 * MM
# The body's flat caps are removed; these UV discs replace them exactly, with a
# hair of overlap under the rim so no crack shows after quantization.
FACE_RADIUS = DISC_RADIUS - RIM_BEVEL + 0.03 * MM
SURFACE_OFFSET = 0.0 * MM


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def make_material(name, color, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_object(name, bm, material):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return link(bpy.data.objects.new(name, mesh))


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


# ---------------------------------------------------------------- body


def build_body(material):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=160,
        radius1=DISC_RADIUS,
        radius2=DISC_RADIUS,
        depth=DISC_DEPTH,
    )
    obj = mesh_object("Medalla_Cuerpo", bm, material)

    bevel = obj.modifiers.new("Canto", "BEVEL")
    bevel.width = RIM_BEVEL
    bevel.segments = 8
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(60)
    bevel.profile = 0.5
    apply_modifiers(obj)

    # Drop the flat front/back caps: Medalla_Cara / Medalla_Reverso take their
    # place, so the engraving surface never z-fights with the body.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    caps = [face for face in bm.faces if abs(face.normal.z) > 0.999 and face.calc_area() > (DISC_RADIUS * 0.5) ** 2]
    bmesh.ops.delete(bm, geom=caps, context="FACES_ONLY")
    bm.to_mesh(obj.data)
    bm.free()

    # Smooth rim: weighted normals keep the edge of the rim crisp.
    obj.modifiers.new("Normales", "WEIGHTED_NORMAL").keep_sharp = True
    apply_modifiers(obj)
    return obj


def build_surface(name, material, z, flip):
    """A flat disc with radial topology and planar UVs mapped 0..1 across the disc."""
    bm = bmesh.new()
    rings, segments = 24, 160
    center = bm.verts.new((0.0, 0.0, z))
    previous = None
    ring_verts = []
    for ring in range(1, rings + 1):
        radius = FACE_RADIUS * ring / rings
        verts = [
            bm.verts.new((radius * math.cos(2 * math.pi * s / segments), radius * math.sin(2 * math.pi * s / segments), z))
            for s in range(segments)
        ]
        ring_verts.append(verts)
        if previous is None:
            for s in range(segments):
                bm.faces.new((center, verts[s], verts[(s + 1) % segments]))
        else:
            for s in range(segments):
                bm.faces.new((previous[s], verts[s], verts[(s + 1) % segments], previous[(s + 1) % segments]))
        previous = verts

    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        for loop in face.loops:
            x, y, _ = loop.vert.co
            u = 0.5 + x / (2 * FACE_RADIUS)
            v = 0.5 + y / (2 * FACE_RADIUS)
            if flip:
                u = 1.0 - u  # the back reads correctly when the medal is turned over
            loop[uv_layer].uv = (u, v)

    obj = mesh_object(name, bm, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


# ---------------------------------------------------------------- rings


def torus(name, major, minor, material, major_segments=48, minor_segments=16):
    bm = bmesh.new()
    verts = []
    for i in range(major_segments):
        a = 2 * math.pi * i / major_segments
        ring = []
        for j in range(minor_segments):
            b = 2 * math.pi * j / minor_segments
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        verts.append(ring)
    for i in range(major_segments):
        for j in range(minor_segments):
            a, b = verts[i], verts[(i + 1) % major_segments]
            bm.faces.new((a[j], b[j], b[(j + 1) % minor_segments], a[(j + 1) % minor_segments]))
    return mesh_object(name, bm, material)


def build_bail(material):
    top = DISC_RADIUS

    # Jump ring through a small hole at the top of the disc, facing the viewer.
    jump = torus("Argolla_aro", 1.15 * MM, 0.28 * MM, material, 40, 12)
    jump.location = (0.0, top + 0.55 * MM, 0.0)
    jump.rotation_euler = (0.0, math.radians(90), 0.0)

    # Bail: a wide, rounded band the chain runs through (axis along X).
    bail = torus("Argolla_puente", 1.7 * MM, 0.42 * MM, material, 48, 16)
    bail.scale = (1.0, 1.55, 2.4)
    bail.location = (0.0, top + 3.6 * MM, 0.0)
    bail.rotation_euler = (0.0, math.radians(90), 0.0)

    for obj in (jump, bail):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)

    bpy.ops.object.select_all(action="DESELECT")
    jump.select_set(True)
    bail.select_set(True)
    bpy.context.view_layer.objects.active = bail
    bpy.ops.object.join()
    bail.name = "Argolla"
    bail.data.name = "Argolla"
    return bail


def build_chain(material, bail_top):
    """Cable chain: alternating links, two strands rising from the bail in a soft V."""
    link_major, link_minor = 0.62 * MM, 0.16 * MM
    pitch = 1.38 * MM
    links_per_strand = 46
    strands = []

    for side in (-1, 1):
        x, y = side * 0.7 * MM, bail_top - 1.3 * MM
        for i in range(links_per_strand):
            # Leaves the bail fairly flat, then curves up out of frame.
            angle = math.radians(min(80, 38 + i * 3.0))
            dx, dy = side * math.cos(angle), math.sin(angle)
            obj = torus(f"Eslabon_{side}_{i}", link_major, link_minor, material, 20, 8)
            obj.scale = (1.0, 1.55, 1.0)
            # Long axis follows the strand; every other link turned 90° about it.
            heading = math.atan2(dy, dx) - math.pi / 2
            twist = math.radians(90) if i % 2 else 0.0
            obj.rotation_euler = (0.0, twist, heading)
            obj.location = (x + dx * pitch / 2, y + dy * pitch / 2, 0.0)
            strands.append(obj)
            x += dx * pitch
            y += dy * pitch

    bpy.ops.object.select_all(action="DESELECT")
    for obj in strands:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = strands[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    chain = bpy.context.view_layer.objects.active
    chain.name = "Cadena"
    chain.data.name = "Cadena"
    return chain


# ---------------------------------------------------------------- scene


def build():
    reset_scene()
    metal = make_material("Metal", (0.83, 0.66, 0.36), 0.18)
    face = make_material("Cara", (0.83, 0.66, 0.36), 0.22)
    back = make_material("Reverso", (0.83, 0.66, 0.36), 0.22)

    build_body(metal)
    half = DISC_DEPTH / 2
    build_surface("Medalla_Cara", face, half + SURFACE_OFFSET, flip=False)
    build_surface("Medalla_Reverso", back, -half - SURFACE_OFFSET, flip=True)
    bail = build_bail(metal)
    bail_top = max((bail.matrix_world @ Vector(v.co)).y for v in bail.data.vertices)
    build_chain(metal, bail_top)

    # Root empty so the configurator can spin the whole piece as one.
    root = bpy.data.objects.new("MedallaFirma", None)
    link(root)
    for obj in list(bpy.context.scene.objects):
        if obj is not root:
            obj.parent = root
    # Modelled lying in XY; stand it up so it faces Blender's front view (-Y),
    # which the glTF exporter turns into +Z facing / +Y up for Three.js.
    root.rotation_euler = (math.radians(90), 0.0, 0.0)

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)

    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )

    stats = {
        obj.name: len(obj.data.polygons)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
    }
    print("MEDALLA_STATS", stats, "glb_bytes", os.path.getsize(GLB_PATH))


build()
