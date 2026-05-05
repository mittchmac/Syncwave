import { GolfCourse } from "@/context/GolfContext";
import { getCachedCourse } from "@/lib/courseCache";

export const FEATURED_COURSES: GolfCourse[] = [
  {
    id: "pebble-beach",
    name: "Pebble Beach Golf Links",
    location: "Pebble Beach, CA",
    par: 72,
    holes: [
      { number: 1, par: 4, handicap: 8, yards: { black: 381, blue: 373, white: 361, red: 312 }, tee: { lat: 36.5681, lng: -121.9496 }, pin: { lat: 36.5685, lng: -121.9487 } },
      { number: 2, par: 5, handicap: 14, yards: { black: 502, blue: 492, white: 479, red: 436 }, tee: { lat: 36.5690, lng: -121.9482 }, pin: { lat: 36.5698, lng: -121.9470 } },
      { number: 3, par: 4, handicap: 12, yards: { black: 388, blue: 373, white: 341, red: 296 }, tee: { lat: 36.5701, lng: -121.9466 }, pin: { lat: 36.5707, lng: -121.9456 } },
      { number: 4, par: 4, handicap: 2, yards: { black: 331, blue: 327, white: 310, red: 280 }, tee: { lat: 36.5710, lng: -121.9451 }, pin: { lat: 36.5716, lng: -121.9443 } },
      { number: 5, par: 3, handicap: 16, yards: { black: 188, blue: 166, white: 143, red: 119 }, tee: { lat: 36.5720, lng: -121.9440 }, pin: { lat: 36.5723, lng: -121.9431 } },
      { number: 6, par: 5, handicap: 6, yards: { black: 516, blue: 506, white: 491, red: 431 }, tee: { lat: 36.5726, lng: -121.9427 }, pin: { lat: 36.5718, lng: -121.9415 } },
      { number: 7, par: 3, handicap: 18, yards: { black: 106, blue: 100, white: 93, red: 75 }, tee: { lat: 36.5712, lng: -121.9413 }, pin: { lat: 36.5709, lng: -121.9405 } },
      { number: 8, par: 4, handicap: 4, yards: { black: 418, blue: 405, white: 383, red: 330 }, tee: { lat: 36.5705, lng: -121.9400 }, pin: { lat: 36.5697, lng: -121.9391 } },
      { number: 9, par: 4, handicap: 10, yards: { black: 466, blue: 452, white: 432, red: 371 }, tee: { lat: 36.5692, lng: -121.9387 }, pin: { lat: 36.5685, lng: -121.9376 } },
      { number: 10, par: 4, handicap: 1, yards: { black: 446, blue: 435, white: 415, red: 360 }, tee: { lat: 36.5678, lng: -121.9372 }, pin: { lat: 36.5670, lng: -121.9362 } },
      { number: 11, par: 4, handicap: 11, yards: { black: 380, blue: 368, white: 341, red: 295 }, tee: { lat: 36.5665, lng: -121.9358 }, pin: { lat: 36.5658, lng: -121.9349 } },
      { number: 12, par: 3, handicap: 17, yards: { black: 202, blue: 187, white: 162, red: 114 }, tee: { lat: 36.5651, lng: -121.9345 }, pin: { lat: 36.5645, lng: -121.9337 } },
      { number: 13, par: 4, handicap: 9, yards: { black: 392, blue: 378, white: 355, red: 327 }, tee: { lat: 36.5638, lng: -121.9333 }, pin: { lat: 36.5630, lng: -121.9324 } },
      { number: 14, par: 5, handicap: 7, yards: { black: 573, blue: 560, white: 545, red: 477 }, tee: { lat: 36.5623, lng: -121.9319 }, pin: { lat: 36.5614, lng: -121.9308 } },
      { number: 15, par: 4, handicap: 3, yards: { black: 397, blue: 393, white: 369, red: 325 }, tee: { lat: 36.5607, lng: -121.9304 }, pin: { lat: 36.5600, lng: -121.9295 } },
      { number: 16, par: 4, handicap: 5, yards: { black: 400, blue: 393, white: 360, red: 316 }, tee: { lat: 36.5593, lng: -121.9291 }, pin: { lat: 36.5586, lng: -121.9282 } },
      { number: 17, par: 3, handicap: 15, yards: { black: 208, blue: 200, white: 175, red: 130 }, tee: { lat: 36.5579, lng: -121.9277 }, pin: { lat: 36.5572, lng: -121.9269 } },
      { number: 18, par: 5, handicap: 13, yards: { black: 543, blue: 530, white: 502, red: 432 }, tee: { lat: 36.5565, lng: -121.9264 }, pin: { lat: 36.5678, lng: -121.9490 } },
    ],
  },
  {
    id: "augusta-national",
    name: "Augusta National Golf Club",
    location: "Augusta, GA",
    par: 72,
    holes: [
      { number: 1, par: 4, handicap: 5, yards: { black: 445, blue: 420, white: 400, red: 365 }, tee: { lat: 33.5030, lng: -82.0218 }, pin: { lat: 33.5022, lng: -82.0212 } },
      { number: 2, par: 5, handicap: 13, yards: { black: 575, blue: 555, white: 535, red: 495 }, tee: { lat: 33.5015, lng: -82.0208 }, pin: { lat: 33.5006, lng: -82.0197 } },
      { number: 3, par: 4, handicap: 3, yards: { black: 350, blue: 340, white: 330, red: 310 }, tee: { lat: 33.4999, lng: -82.0193 }, pin: { lat: 33.4993, lng: -82.0185 } },
      { number: 4, par: 3, handicap: 15, yards: { black: 240, blue: 225, white: 205, red: 170 }, tee: { lat: 33.4986, lng: -82.0180 }, pin: { lat: 33.4980, lng: -82.0172 } },
      { number: 5, par: 4, handicap: 11, yards: { black: 455, blue: 440, white: 420, red: 385 }, tee: { lat: 33.4973, lng: -82.0167 }, pin: { lat: 33.4965, lng: -82.0158 } },
      { number: 6, par: 3, handicap: 17, yards: { black: 180, blue: 166, white: 150, red: 127 }, tee: { lat: 33.4958, lng: -82.0153 }, pin: { lat: 33.4952, lng: -82.0145 } },
      { number: 7, par: 4, handicap: 9, yards: { black: 450, blue: 435, white: 410, red: 370 }, tee: { lat: 33.4945, lng: -82.0140 }, pin: { lat: 33.4938, lng: -82.0132 } },
      { number: 8, par: 5, handicap: 1, yards: { black: 570, blue: 555, white: 535, red: 500 }, tee: { lat: 33.4931, lng: -82.0127 }, pin: { lat: 33.4922, lng: -82.0118 } },
      { number: 9, par: 4, handicap: 7, yards: { black: 460, blue: 445, white: 425, red: 390 }, tee: { lat: 33.4915, lng: -82.0113 }, pin: { lat: 33.5028, lng: -82.0215 } },
      { number: 10, par: 4, handicap: 2, yards: { black: 495, blue: 480, white: 455, red: 420 }, tee: { lat: 33.5025, lng: -82.0210 }, pin: { lat: 33.5018, lng: -82.0201 } },
      { number: 11, par: 4, handicap: 6, yards: { black: 520, blue: 505, white: 490, red: 450 }, tee: { lat: 33.5011, lng: -82.0197 }, pin: { lat: 33.5003, lng: -82.0188 } },
      { number: 12, par: 3, handicap: 16, yards: { black: 155, blue: 145, white: 130, red: 105 }, tee: { lat: 33.4996, lng: -82.0184 }, pin: { lat: 33.4990, lng: -82.0176 } },
      { number: 13, par: 5, handicap: 14, yards: { black: 510, blue: 495, white: 475, red: 440 }, tee: { lat: 33.4983, lng: -82.0171 }, pin: { lat: 33.4975, lng: -82.0162 } },
      { number: 14, par: 4, handicap: 10, yards: { black: 440, blue: 425, white: 405, red: 370 }, tee: { lat: 33.4968, lng: -82.0157 }, pin: { lat: 33.4960, lng: -82.0148 } },
      { number: 15, par: 5, handicap: 12, yards: { black: 550, blue: 535, white: 510, red: 475 }, tee: { lat: 33.4953, lng: -82.0143 }, pin: { lat: 33.4945, lng: -82.0134 } },
      { number: 16, par: 3, handicap: 18, yards: { black: 170, blue: 155, white: 140, red: 112 }, tee: { lat: 33.4938, lng: -82.0129 }, pin: { lat: 33.4932, lng: -82.0121 } },
      { number: 17, par: 4, handicap: 8, yards: { black: 440, blue: 425, white: 400, red: 365 }, tee: { lat: 33.4925, lng: -82.0116 }, pin: { lat: 33.4918, lng: -82.0107 } },
      { number: 18, par: 4, handicap: 4, yards: { black: 465, blue: 450, white: 420, red: 385 }, tee: { lat: 33.4911, lng: -82.0102 }, pin: { lat: 33.5027, lng: -82.0217 } },
    ],
  },
  {
    id: "st-andrews-old",
    name: "St Andrews — Old Course",
    location: "St Andrews, Scotland",
    par: 72,
    holes: [
      { number: 1, par: 4, handicap: 9, yards: { black: 376, blue: 370, white: 354, red: 320 }, tee: { lat: 56.3403, lng: -2.8036 }, pin: { lat: 56.3411, lng: -2.8025 } },
      { number: 2, par: 4, handicap: 11, yards: { black: 453, blue: 443, white: 421, red: 385 }, tee: { lat: 56.3416, lng: -2.8019 }, pin: { lat: 56.3423, lng: -2.8009 } },
      { number: 3, par: 4, handicap: 15, yards: { black: 397, blue: 386, white: 364, red: 329 }, tee: { lat: 56.3428, lng: -2.8003 }, pin: { lat: 56.3435, lng: -2.7993 } },
      { number: 4, par: 4, handicap: 3, yards: { black: 480, blue: 468, white: 447, red: 411 }, tee: { lat: 56.3440, lng: -2.7987 }, pin: { lat: 56.3447, lng: -2.7976 } },
      { number: 5, par: 5, handicap: 7, yards: { black: 568, blue: 558, white: 535, red: 496 }, tee: { lat: 56.3452, lng: -2.7970 }, pin: { lat: 56.3459, lng: -2.7959 } },
      { number: 6, par: 4, handicap: 13, yards: { black: 412, blue: 400, white: 374, red: 338 }, tee: { lat: 56.3464, lng: -2.7953 }, pin: { lat: 56.3471, lng: -2.7942 } },
      { number: 7, par: 4, handicap: 5, yards: { black: 390, blue: 380, white: 362, red: 326 }, tee: { lat: 56.3476, lng: -2.7936 }, pin: { lat: 56.3483, lng: -2.7925 } },
      { number: 8, par: 3, handicap: 17, yards: { black: 178, blue: 166, white: 151, red: 132 }, tee: { lat: 56.3488, lng: -2.7919 }, pin: { lat: 56.3494, lng: -2.7909 } },
      { number: 9, par: 4, handicap: 1, yards: { black: 352, blue: 341, white: 328, red: 298 }, tee: { lat: 56.3499, lng: -2.7903 }, pin: { lat: 56.3506, lng: -2.7893 } },
      { number: 10, par: 4, handicap: 10, yards: { black: 380, blue: 370, white: 345, red: 310 }, tee: { lat: 56.3511, lng: -2.7887 }, pin: { lat: 56.3504, lng: -2.7876 } },
      { number: 11, par: 3, handicap: 18, yards: { black: 174, blue: 162, white: 150, red: 128 }, tee: { lat: 56.3498, lng: -2.7871 }, pin: { lat: 56.3491, lng: -2.7861 } },
      { number: 12, par: 4, handicap: 6, yards: { black: 348, blue: 340, white: 316, red: 287 }, tee: { lat: 56.3485, lng: -2.7856 }, pin: { lat: 56.3478, lng: -2.7846 } },
      { number: 13, par: 4, handicap: 12, yards: { black: 425, blue: 415, white: 392, red: 355 }, tee: { lat: 56.3472, lng: -2.7840 }, pin: { lat: 56.3465, lng: -2.7830 } },
      { number: 14, par: 5, handicap: 2, yards: { black: 618, blue: 606, white: 581, red: 532 }, tee: { lat: 56.3459, lng: -2.7825 }, pin: { lat: 56.3452, lng: -2.7814 } },
      { number: 15, par: 4, handicap: 4, yards: { black: 456, blue: 445, white: 421, red: 386 }, tee: { lat: 56.3446, lng: -2.7809 }, pin: { lat: 56.3439, lng: -2.7799 } },
      { number: 16, par: 4, handicap: 8, yards: { black: 423, blue: 411, white: 382, red: 344 }, tee: { lat: 56.3433, lng: -2.7794 }, pin: { lat: 56.3426, lng: -2.7784 } },
      { number: 17, par: 4, handicap: 14, yards: { black: 495, blue: 484, white: 456, red: 416 }, tee: { lat: 56.3420, lng: -2.7779 }, pin: { lat: 56.3413, lng: -2.7769 } },
      { number: 18, par: 4, handicap: 16, yards: { black: 357, blue: 350, white: 320, red: 284 }, tee: { lat: 56.3407, lng: -2.7764 }, pin: { lat: 56.3403, lng: -2.8030 } },
    ],
  },
  {
    id: "torrey-pines-south",
    name: "Torrey Pines — South Course",
    location: "La Jolla, CA",
    par: 72,
    holes: [
      { number: 1, par: 4, handicap: 13, yards: { black: 448, blue: 430, white: 405, red: 370 }, tee: { lat: 32.8976, lng: -117.2516 }, pin: { lat: 32.8968, lng: -117.2507 } },
      { number: 2, par: 4, handicap: 11, yards: { black: 389, blue: 374, white: 355, red: 320 }, tee: { lat: 32.8961, lng: -117.2502 }, pin: { lat: 32.8954, lng: -117.2493 } },
      { number: 3, par: 3, handicap: 17, yards: { black: 200, blue: 186, white: 165, red: 136 }, tee: { lat: 32.8947, lng: -117.2488 }, pin: { lat: 32.8941, lng: -117.2479 } },
      { number: 4, par: 5, handicap: 1, yards: { black: 608, blue: 591, white: 561, red: 518 }, tee: { lat: 32.8934, lng: -117.2474 }, pin: { lat: 32.8926, lng: -117.2465 } },
      { number: 5, par: 4, handicap: 3, yards: { black: 460, blue: 447, white: 425, red: 390 }, tee: { lat: 32.8919, lng: -117.2461 }, pin: { lat: 32.8912, lng: -117.2452 } },
      { number: 6, par: 4, handicap: 15, yards: { black: 406, blue: 393, white: 372, red: 338 }, tee: { lat: 32.8905, lng: -117.2447 }, pin: { lat: 32.8898, lng: -117.2438 } },
      { number: 7, par: 3, handicap: 9, yards: { black: 177, blue: 164, white: 147, red: 123 }, tee: { lat: 32.8891, lng: -117.2433 }, pin: { lat: 32.8885, lng: -117.2424 } },
      { number: 8, par: 4, handicap: 5, yards: { black: 455, blue: 438, white: 415, red: 379 }, tee: { lat: 32.8878, lng: -117.2419 }, pin: { lat: 32.8871, lng: -117.2410 } },
      { number: 9, par: 5, handicap: 7, yards: { black: 575, blue: 557, white: 530, red: 493 }, tee: { lat: 32.8864, lng: -117.2405 }, pin: { lat: 32.8976, lng: -117.2510 } },
      { number: 10, par: 4, handicap: 12, yards: { black: 417, blue: 403, white: 382, red: 347 }, tee: { lat: 32.8970, lng: -117.2505 }, pin: { lat: 32.8963, lng: -117.2496 } },
      { number: 11, par: 3, handicap: 18, yards: { black: 224, blue: 211, white: 190, red: 157 }, tee: { lat: 32.8956, lng: -117.2491 }, pin: { lat: 32.8950, lng: -117.2482 } },
      { number: 12, par: 5, handicap: 16, yards: { black: 568, blue: 553, white: 528, red: 491 }, tee: { lat: 32.8943, lng: -117.2477 }, pin: { lat: 32.8936, lng: -117.2468 } },
      { number: 13, par: 4, handicap: 6, yards: { black: 452, blue: 438, white: 415, red: 379 }, tee: { lat: 32.8929, lng: -117.2463 }, pin: { lat: 32.8922, lng: -117.2454 } },
      { number: 14, par: 4, handicap: 8, yards: { black: 469, blue: 455, white: 432, red: 396 }, tee: { lat: 32.8915, lng: -117.2449 }, pin: { lat: 32.8908, lng: -117.2440 } },
      { number: 15, par: 4, handicap: 2, yards: { black: 476, blue: 462, white: 437, red: 400 }, tee: { lat: 32.8901, lng: -117.2435 }, pin: { lat: 32.8894, lng: -117.2426 } },
      { number: 16, par: 3, handicap: 14, yards: { black: 218, blue: 205, white: 183, red: 151 }, tee: { lat: 32.8887, lng: -117.2421 }, pin: { lat: 32.8881, lng: -117.2412 } },
      { number: 17, par: 4, handicap: 4, yards: { black: 416, blue: 403, white: 381, red: 347 }, tee: { lat: 32.8874, lng: -117.2407 }, pin: { lat: 32.8867, lng: -117.2398 } },
      { number: 18, par: 5, handicap: 10, yards: { black: 570, blue: 556, white: 528, red: 490 }, tee: { lat: 32.8860, lng: -117.2393 }, pin: { lat: 32.8975, lng: -117.2515 } },
    ],
  },
  {
    id: "bethpage-black",
    name: "Bethpage Black",
    location: "Farmingdale, NY",
    par: 71,
    holes: [
      { number: 1, par: 4, handicap: 11, yards: { black: 430, blue: 416, white: 397, red: 362 }, tee: { lat: 40.7441, lng: -73.4594 }, pin: { lat: 40.7433, lng: -73.4585 } },
      { number: 2, par: 4, handicap: 9, yards: { black: 389, blue: 376, white: 357, red: 323 }, tee: { lat: 40.7426, lng: -73.4580 }, pin: { lat: 40.7419, lng: -73.4571 } },
      { number: 3, par: 3, handicap: 17, yards: { black: 230, blue: 216, white: 193, red: 159 }, tee: { lat: 40.7412, lng: -73.4566 }, pin: { lat: 40.7406, lng: -73.4557 } },
      { number: 4, par: 5, handicap: 7, yards: { black: 517, blue: 502, white: 478, red: 441 }, tee: { lat: 40.7399, lng: -73.4552 }, pin: { lat: 40.7392, lng: -73.4543 } },
      { number: 5, par: 4, handicap: 5, yards: { black: 478, blue: 463, white: 440, red: 404 }, tee: { lat: 40.7385, lng: -73.4538 }, pin: { lat: 40.7378, lng: -73.4529 } },
      { number: 6, par: 4, handicap: 1, yards: { black: 408, blue: 394, white: 374, red: 339 }, tee: { lat: 40.7371, lng: -73.4524 }, pin: { lat: 40.7364, lng: -73.4515 } },
      { number: 7, par: 5, handicap: 15, yards: { black: 517, blue: 502, white: 479, red: 441 }, tee: { lat: 40.7357, lng: -73.4510 }, pin: { lat: 40.7350, lng: -73.4501 } },
      { number: 8, par: 3, handicap: 13, yards: { black: 210, blue: 197, white: 175, red: 144 }, tee: { lat: 40.7343, lng: -73.4496 }, pin: { lat: 40.7337, lng: -73.4487 } },
      { number: 9, par: 4, handicap: 3, yards: { black: 418, blue: 404, white: 383, red: 348 }, tee: { lat: 40.7330, lng: -73.4482 }, pin: { lat: 40.7443, lng: -73.4591 } },
      { number: 10, par: 4, handicap: 16, yards: { black: 492, blue: 476, white: 450, red: 414 }, tee: { lat: 40.7439, lng: -73.4588 }, pin: { lat: 40.7432, lng: -73.4579 } },
      { number: 11, par: 4, handicap: 6, yards: { black: 435, blue: 421, white: 399, red: 363 }, tee: { lat: 40.7425, lng: -73.4574 }, pin: { lat: 40.7418, lng: -73.4565 } },
      { number: 12, par: 4, handicap: 14, yards: { black: 499, blue: 484, white: 458, red: 422 }, tee: { lat: 40.7411, lng: -73.4560 }, pin: { lat: 40.7404, lng: -73.4551 } },
      { number: 13, par: 5, handicap: 18, yards: { black: 617, blue: 600, white: 572, red: 530 }, tee: { lat: 40.7397, lng: -73.4546 }, pin: { lat: 40.7390, lng: -73.4537 } },
      { number: 14, par: 3, handicap: 12, yards: { black: 161, blue: 149, white: 132, red: 107 }, tee: { lat: 40.7383, lng: -73.4532 }, pin: { lat: 40.7377, lng: -73.4523 } },
      { number: 15, par: 4, handicap: 2, yards: { black: 459, blue: 445, white: 421, red: 386 }, tee: { lat: 40.7370, lng: -73.4518 }, pin: { lat: 40.7363, lng: -73.4509 } },
      { number: 16, par: 4, handicap: 10, yards: { black: 479, blue: 464, white: 440, red: 404 }, tee: { lat: 40.7356, lng: -73.4504 }, pin: { lat: 40.7349, lng: -73.4495 } },
      { number: 17, par: 3, handicap: 8, yards: { black: 207, blue: 195, white: 173, red: 142 }, tee: { lat: 40.7342, lng: -73.4490 }, pin: { lat: 40.7336, lng: -73.4481 } },
      { number: 18, par: 4, handicap: 4, yards: { black: 411, blue: 397, white: 377, red: 342 }, tee: { lat: 40.7329, lng: -73.4476 }, pin: { lat: 40.7442, lng: -73.4593 } },
    ],
  },
];

export function searchCourses(query: string): GolfCourse[] {
  const q = query.toLowerCase().trim();
  if (!q) return FEATURED_COURSES;
  return FEATURED_COURSES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q)
  );
}

export function getCourseById(id: string): GolfCourse | undefined {
  return FEATURED_COURSES.find((c) => c.id === id) ?? getCachedCourse(id);
}

export function getScoreLabel(strokes: number, par: number): string {
  const diff = strokes - par;
  if (strokes === 1) return "Hole in One";
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double Bogey";
  if (diff === 3) return "Triple Bogey";
  return `+${diff}`;
}

export function getScoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return "#f5c518";
  if (diff === -1) return "#3ecf6e";
  if (diff === 0) return "#ede8e0";
  if (diff === 1) return "#f59e0b";
  return "#e03434";
}
