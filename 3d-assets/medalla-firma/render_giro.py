"""
Medalla Firma — scroll turntable for the Home banner ("Mírala girar antes de pedirla").

Renders an image sequence of the medal turning to face the camera, on a dark
studio set like the banner photo (Cycles). The Home scrubs through it as you scroll
(sections/mi-spin-banner.liquid + assets/mi-spin.js): no WebGL on the Home,
only images.

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python 3d-assets/medalla-firma/render_giro.py -- <out_dir> [full|test] [desktop,mobile]

Writes <out_dir>/<variant>/giro_###.png; scripts/frames_to_webp.py turns them
into theme/assets/mi-giro-<d|m>-##.webp.

Requires medalla-firma.blend (run build_medalla.py first) and the OFL font in
3d-assets/fonts/. The engraving here is real geometry (text boolean), not the
configurator's texture.
"""

import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "medalla-firma.blend")
FONT = os.path.join(HERE, "..", "fonts", "IbarraRealNova-wght.ttf")

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT_DIR = ARGS[0] if ARGS else os.path.join(HERE, "giro")
MODE = ARGS[1] if len(ARGS) > 1 else "full"
VARIANTS = (ARGS[2] if len(ARGS) > 2 else "desktop,mobile").split(",")
ONLY_FRAMES = [int(f) for f in ARGS[3].split(",")] if len(ARGS) > 3 else None

FRAMES = 72
TURN_DEGREES = 240  # starts showing the back/edge, ends facing the camera
TEXT = "M·I"

MM = 0.001
DISC_RADIUS = 9.0 * MM
DISC_DEPTH = 1.4 * MM
RIM_BEVEL = 0.45 * MM
CUT_DEPTH = 0.16 * MM

VARIANT_SETTINGS = {
    # resolution, sensor fit, camera distance, aim offset below the disc center
    "desktop": {"res": (1600, 900), "fit": "HORIZONTAL", "distance": 0.25, "aim": -3.5 * MM},
    "mobile": {"res": (720, 1280), "fit": "VERTICAL", "distance": 0.24, "aim": -10.0 * MM},
}


def ease_in_out(t):
    return -(math.cos(math.pi * t) - 1) / 2


# ---------------------------------------------------------------- materials


def principled(name, color, roughness, metallic=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


# ---------------------------------------------------------------- geometry


def solid_disc(root, gold, cut):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=192, radius1=DISC_RADIUS, radius2=DISC_RADIUS, depth=DISC_DEPTH)
    mesh = bpy.data.meshes.new("Disco_Render")
    bm.to_mesh(mesh)
    bm.free()
    disc = bpy.data.objects.new("Disco_Render", mesh)
    bpy.context.scene.collection.objects.link(disc)
    disc.parent = root
    mesh.materials.append(gold)
    mesh.materials.append(cut)

    bevel = disc.modifiers.new("Canto", "BEVEL")
    bevel.width = RIM_BEVEL
    bevel.segments = 8
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(60)

    # Engraved text: a font curve extruded through the front face.
    curve = bpy.data.curves.new("Grabado", "FONT")
    curve.body = TEXT
    curve.font = bpy.data.fonts.load(FONT)
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = CUT_DEPTH
    curve.size = 1.0 * MM
    text = bpy.data.objects.new("Grabado", curve)
    bpy.context.scene.collection.objects.link(text)
    text.parent = root
    curve.materials.append(cut)
    bpy.context.view_layer.update()
    target_width = DISC_RADIUS * 2 * 0.52
    curve.size = 1.0 * MM * target_width / max(text.dimensions.x, 1e-6)
    curve.resolution_u = 16
    bpy.context.view_layer.update()

    # The boolean needs a mesh operand: bake the extruded glyphs.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    cutter_mesh = bpy.data.meshes.new_from_object(text.evaluated_get(depsgraph))
    cutter = bpy.data.objects.new("Grabado_Corte", cutter_mesh)
    bpy.context.scene.collection.objects.link(cutter)
    cutter.parent = root
    cutter.location = (0.0, 0.0, DISC_DEPTH / 2)
    bpy.context.view_layer.update()

    boolean = disc.modifiers.new("Grabado", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.material_mode = "TRANSFER"
    boolean.object = cutter

    bpy.context.view_layer.objects.active = disc
    disc.select_set(True)
    for modifier in list(disc.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    disc.select_set(False)
    for obj in (text, cutter):
        obj.hide_render = True
        obj.hide_viewport = True
    return disc


# ---------------------------------------------------------------- set


def area_light(name, location, size, power, color, target=(0.0, 0.0, 0.0), shape="RECTANGLE", size_y=None):
    light = bpy.data.lights.new(name, "AREA")
    light.shape = shape
    light.size = size
    if size_y is not None:
        light.size_y = size_y
    light.energy = power
    light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def emissive_plane(name, size, location, facing, stops, radial=False, radius=0.2, camera_visible=True):
    """A plane that emits light with a gradient: radial (glow) or vertical (softbox)."""
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=location)
    plane = bpy.context.active_object
    plane.name = name
    plane.scale = (size[0], size[1], 1.0)
    plane.rotation_euler = (-Vector(facing)).to_track_quat("-Z", "Y").to_euler()
    plane.visible_shadow = False
    plane.visible_camera = camera_visible

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    ramp = nodes.new("ShaderNodeValToRGB")
    coords = nodes.new("ShaderNodeTexCoord")
    ramp.color_ramp.interpolation = "EASE"
    elements = ramp.color_ramp.elements
    elements[0].position, elements[0].color = stops[0][0], (*stops[0][1], 1.0)
    elements[1].position, elements[1].color = stops[-1][0], (*stops[-1][1], 1.0)
    for position, color in stops[1:-1]:
        element = elements.new(position)
        element.color = (*color, 1.0)

    if radial:
        # 1 at the center, 0 at `radius` meters (object space of a unit plane).
        length = nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        scale = nodes.new("ShaderNodeVectorMath")
        scale.operation = "SCALE"
        scale.inputs["Scale"].default_value = size[0] / radius
        invert = nodes.new("ShaderNodeMath")
        invert.operation = "SUBTRACT"
        invert.inputs[0].default_value = 1.0
        invert.use_clamp = True
        links.new(coords.outputs["Object"], scale.inputs[0])
        links.new(scale.outputs["Vector"], length.inputs[0])
        links.new(length.outputs["Value"], invert.inputs[1])
        links.new(invert.outputs["Value"], ramp.inputs["Fac"])
    else:
        # Bottom → top of the plane.
        separate = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coords.outputs["Generated"], separate.inputs["Vector"])
        links.new(separate.outputs["Y"], ramp.inputs["Fac"])

    emission.inputs["Strength"].default_value = 1.0
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    plane.data.materials.append(material)
    return plane


def build_world(world):
    """Black to the camera, but a dim warm room in reflections: a polished face
    turned away from the softboxes reads as dark gold instead of a black hole."""
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"

    # Generated = view direction; Z from -1 (floor) to 1 (ceiling) → 0..1
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (0.012, 0.008, 0.005, 1.0)
    ramp.color_ramp.elements[1].position = 0.9
    ramp.color_ramp.elements[1].color = (0.11, 0.075, 0.045, 1.0)
    remap = nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0

    links.new(coords.outputs["Generated"], separate.inputs["Vector"])
    links.new(separate.outputs["Z"], remap.inputs["Value"])
    links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Factor"])
    links.new(ramp.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (0.0, 0.0, 0.0, 1.0)
    links.new(mix.outputs["Result"], background.inputs["Color"])
    background.inputs["Strength"].default_value = 1.0
    links.new(background.outputs["Background"], output.inputs["Surface"])


def build_set():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    scene = bpy.context.scene
    root = bpy.data.objects["MedallaFirma"]

    gold = principled("Oro_Render", (1.0, 0.74, 0.38), 0.17)
    cut = principled("Grabado_Render", (0.45, 0.29, 0.1), 0.55)

    for name in ("Medalla_Cuerpo", "Medalla_Cara", "Medalla_Reverso"):
        bpy.data.objects[name].hide_render = True
        bpy.data.objects[name].hide_viewport = True
    for name in ("Argolla", "Cadena"):
        bpy.data.objects[name].data.materials.clear()
        bpy.data.objects[name].data.materials.append(gold)
    solid_disc(root, gold, cut)

    # Dark world; the light comes from emissive softboxes (Cycles reflects them
    # exactly, which is what makes polished gold read as gold).
    world = bpy.data.worlds.new("Estudio")
    scene.world = world
    world.use_nodes = True
    build_world(world)

    # Visible backdrop: black with a soft warm glow behind the piece.
    emissive_plane(
        "Fondo", size=(0.6, 0.4), location=(0.0, 0.12, 0.016), facing=(0.0, -1.0, 0.0),
        stops=[(0.0, (0.0, 0.0, 0.0)), (0.4, (0.004, 0.0024, 0.001)), (0.75, (0.03, 0.017, 0.007)), (1.0, (0.08, 0.045, 0.017))],
        radial=True, radius=0.1,
    )

    warm = (1.0, 0.82, 0.6)
    # Softbox behind the camera: the flat face mirrors it as it turns, bright
    # at the top and falling off toward the bottom, like the banner photo.
    emissive_plane(
        "Softbox", size=(0.62, 0.3), location=(0.0, -0.42, 0.06), facing=(0.0, 1.0, -0.12),
        stops=[(0.0, (0.02, 0.015, 0.01)), (0.3, (0.32, 0.24, 0.15)), (1.0, (2.6, 2.05, 1.4))],
        camera_visible=False,
    )
    # Strip on the left for a long highlight across the rim and the face.
    emissive_plane(
        "Tira", size=(0.03, 0.22), location=(-0.16, -0.12, 0.04), facing=(1.0, 0.75, -0.2),
        stops=[(0.0, (0.5, 0.38, 0.24)), (1.0, (3.2, 2.5, 1.7))],
        camera_visible=False,
    )
    # Rim lights behind for edge glints on the rim, the bail and the chain.
    area_light("Contra_izq", (-0.07, 0.08, 0.06), 0.02, 0.14, warm)
    area_light("Contra_der", (0.07, 0.08, 0.03), 0.02, 0.11, warm)
    # Small key above for sparkle on the chain.
    area_light("Clave", (-0.04, -0.08, 0.14), 0.03, 0.12, warm)

    scene.render.engine = "CYCLES"
    cycles = scene.cycles
    cycles.samples = 48 if MODE == "full" else 32
    cycles.adaptive_threshold = 0.02
    # No persistent data: reusing it across frames left the chain black mid-turn.
    scene.render.use_persistent_data = False
    cycles.use_denoising = True
    cycles.max_bounces = 6
    cycles.glossy_bounces = 4
    cycles.diffuse_bounces = 1
    cycles.transmission_bounces = 0
    cycles.volume_bounces = 0
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "METAL"
        preferences.get_devices()
        for device in preferences.devices:
            device.use = True
        cycles.device = "GPU"
    except Exception as error:  # CPU fallback
        print("GIRO_CPU", error)
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"

    camera_data = bpy.data.cameras.new("Camara")
    camera_data.lens = 100
    camera_data.sensor_width = 36
    camera = bpy.data.objects.new("Camara", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, root, camera


def pose(root, camera, settings, t):
    eased = ease_in_out(t)
    # Spin about the vertical axis (global Z, applied after the stand-up X turn).
    spin = math.radians(-TURN_DEGREES) * (1.0 - eased)
    sway = math.radians(2.5) * math.sin(math.pi * 2 * t) * (1.0 - eased)
    root.rotation_euler = (math.radians(90), sway, spin)
    # Slow push-in.
    distance = settings["distance"] * (1.12 - 0.12 * eased)
    aim = Vector((0.0, 0.0, settings["aim"]))
    camera.location = (0.0, -distance, settings["aim"])
    camera.rotation_euler = (aim - camera.location).to_track_quat("-Z", "Y").to_euler()


def render():
    scene, root, camera = build_set()
    frames = range(FRAMES)
    if MODE == "test":
        frames = [FRAMES // 2, FRAMES - 1]
    if ONLY_FRAMES is not None:
        frames = ONLY_FRAMES

    for variant in VARIANTS:
        settings = VARIANT_SETTINGS[variant]
        width, height = settings["res"]
        scale = 0.5 if MODE == "test" else 1.0
        scene.render.resolution_x = int(width * scale)
        scene.render.resolution_y = int(height * scale)
        scene.render.resolution_percentage = 100
        camera.data.sensor_fit = settings["fit"]
        out = os.path.join(OUT_DIR, variant)
        os.makedirs(out, exist_ok=True)
        for frame in frames:
            t = frame / (FRAMES - 1)
            pose(root, camera, settings, t)
            scene.render.filepath = os.path.join(out, f"giro_{frame:03d}.png")
            started = time.time()
            bpy.ops.render.render(write_still=True)
            print("GIRO_FRAME", variant, frame, f"{time.time() - started:.1f}s")


render()
