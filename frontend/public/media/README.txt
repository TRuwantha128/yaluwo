YOUR PHOTOS AND VIDEOS
======================
Drop files into this folder with these exact names. They show up on the
site automatically. Anything missing is skipped and a clean placeholder in
your theme colour is shown instead.

Home page
  hero.mp4       Video behind the top of the home page
                 (MP4, muted, 10-20 seconds, under 8 MB, 1920x1080)
  hero.jpg       Still image shown while hero.mp4 loads
  cta.mp4        Video behind the "Got a route in mind?" banner

Destination photos  (folder: destinations)
  One folder per place, named with the place id from src/data/destinations.js:
    destinations/nine-arch/1.webp      large photo (up to 1800 px)
    destinations/nine-arch/1-sm.webp   small copy for cards (560 px short side)
  Photo 1 is the cover. SOURCES.txt lists which of your original files each one is.

  To add a photo: make both sizes as WebP (or ask Claude to run the photo
  script again), put them in the place's folder and add a photo(...) entry
  for it in src/data/destinations.js.

Trip cover photos are uploaded by the organiser on the "Create a trip" page.

To change file names, edit src/config/media.js.

First screen of the home page
  A 3D fly-through of your destination photos. Which places (and where each
  photo sits on screen) is set at the top of src/components/PhotoIntro.jsx.
