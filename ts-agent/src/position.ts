/**
 * Absolute position tracking based on heading + distance traveled.
 *
 * Coordinate system:
 *   - Origin (0, 0) is the car's starting position
 *   - Heading 0° = initial forward direction (positive Y axis)
 *   - Heading 90° = right (positive X axis)
 *   - X increases to the right, Y increases forward
 */

export interface Position {
  x: number; // inches
  y: number; // inches
}

export interface MarkedLocation {
  name: string;
  description: string;
  position: Position;
  heading: number; // heading the car was facing when it marked this
}

export class PositionTracker {
  /** Current heading in degrees (0-360), 0 = initial forward */
  heading: number = 0;
  /** Current position in inches */
  position: Position = { x: 0, y: 0 };
  /** Saved locations */
  private markers: Map<string, MarkedLocation> = new Map();

  /** Update state after a turn (positive = right, negative = left) */
  applyTurn(degrees: number): void {
    this.heading = ((this.heading + degrees) % 360 + 360) % 360;
  }

  /** Update state after linear movement (positive = forward, negative = backward) */
  applyMove(inches: number): void {
    const rad = (this.heading * Math.PI) / 180;
    this.position.x += inches * Math.sin(rad);
    this.position.y += inches * Math.cos(rad);
  }

  /** Mark the current location with a name and description */
  markLocation(name: string, description: string): void {
    this.markers.set(name, {
      name,
      description,
      position: { ...this.position },
      heading: this.heading,
    });
  }

  /** Get all marked locations with distance and bearing from current position */
  getMarkedLocations(): Array<{
    name: string;
    description: string;
    distanceInches: number;
    bearingDegrees: number;
    relativeBearing: string;
  }> {
    return Array.from(this.markers.values()).map((loc) => {
      const dx = loc.position.x - this.position.x;
      const dy = loc.position.y - this.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Absolute bearing to the target (0° = north/forward from start)
      const absBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

      // Relative bearing = how many degrees to turn from current heading
      let relative = ((absBearing - this.heading) % 360 + 360) % 360;
      if (relative > 180) relative -= 360;

      const relativeDesc =
        Math.abs(relative) < 10
          ? "ahead"
          : relative > 0
            ? `${Math.round(Math.abs(relative))}° to the right`
            : `${Math.round(Math.abs(relative))}° to the left`;

      return {
        name: loc.name,
        description: loc.description,
        distanceInches: Math.round(distance * 10) / 10,
        bearingDegrees: Math.round(absBearing),
        relativeBearing: relativeDesc,
      };
    });
  }

  /** Get navigation instructions to a named location */
  navigateTo(name: string): {
    found: boolean;
    turnDegrees?: number;
    turnDirection?: "left" | "right";
    distanceInches?: number;
    description?: string;
  } {
    const loc = this.markers.get(name);
    if (!loc) return { found: false };

    const dx = loc.position.x - this.position.x;
    const dy = loc.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const absBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    let relative = ((absBearing - this.heading) % 360 + 360) % 360;
    if (relative > 180) relative -= 360;

    return {
      found: true,
      turnDegrees: Math.round(Math.abs(relative)),
      turnDirection: relative >= 0 ? "right" : "left",
      distanceInches: Math.round(distance),
      description: `Turn ${Math.round(Math.abs(relative))}° ${relative >= 0 ? "right" : "left"}, then drive ${Math.round(distance)} inches forward.`,
    };
  }

  /** Get a formatted status string for context injection */
  getStatusString(): string {
    const h = Math.round(this.heading);
    const x = Math.round(this.position.x * 10) / 10;
    const y = Math.round(this.position.y * 10) / 10;
    let status = `Position: (${x}", ${y}") | Heading: ${h}°`;

    if (this.markers.size > 0) {
      const locs = this.getMarkedLocations();
      status += ` | Marked locations: ${locs.map((l) => `"${l.name}" (${l.distanceInches}" away, ${l.relativeBearing})`).join(", ")}`;
    }

    return status;
  }
}
