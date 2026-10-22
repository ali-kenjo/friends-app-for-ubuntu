// Every place's builder, by its id (room.mjs PLACES). A builder gets what the room asks for and
// returns what it made: { backdrop, glow?, update?, ownFloor?, roam?, dispose? }.
import { studio, glow, gradient, photo, green, blue } from "./basic.js";
import { desk } from "./desk.js";
import { podcast } from "./podcast.js";
import { lounge } from "./lounge.js";
import { space } from "./space.js";
import { garden } from "./garden.js";
import { city } from "./city.js";
import { sky } from "./sky.js";
import {
  bedroom,
  kitchen,
  library,
  greenhouse,
  rooftop,
  workshop,
  cabin,
  seaside,
  campfire,
  cafe,
  arcade,
  observatory,
  tatami,
  spaceship,
} from "./new-places.js";

export const PLACE_BUILDERS = {
  studio,
  glow,
  desk,
  podcast,
  lounge,
  space,
  garden,
  city,
  sky,
  bedroom,
  kitchen,
  library,
  greenhouse,
  rooftop,
  workshop,
  cabin,
  seaside,
  campfire,
  cafe,
  arcade,
  observatory,
  tatami,
  spaceship,
  gradient,
  photo,
  green,
  blue,
};
