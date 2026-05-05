/**
 * Runtime in-memory cache for courses found via Overpass API.
 * Allows setup.tsx to look up any OSM course by its generated ID.
 */
import type { GolfCourse } from "@/context/GolfContext";

const cache = new Map<string, GolfCourse>();

export function cacheCourse(course: GolfCourse): void {
  cache.set(course.id, course);
}

export function getCachedCourse(id: string): GolfCourse | undefined {
  return cache.get(id);
}

export function cacheAll(courses: GolfCourse[]): void {
  for (const c of courses) cache.set(c.id, c);
}
