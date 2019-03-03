'use strict';

// Application Dependencies
const express = require('express');
const superagent = require('superagent');
const pg = require('pg');
const cors = require('cors');

// Load environment variables from .env file
require('dotenv').config();

// Application Setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Database Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.error(err));

// Location Route
app.get('/location', (request, response) => {
  getLocation(request.query.data)
    .then(location => {
      response.send(location)
    })
    .catch(error => handleError(error, response));
})

// Weather Route
app.get('/weather', getWeather);

// Meetup Route
app.get('/meetups', getMeetups);

// Yelp route
app.get('/yelp', getYelp);

// Movie DB route
app.get('/movies', getMovies);

// Trails Route
app.get('/trails', getTrails);



// Make sure the server is listening for requests
app.listen(PORT, () => console.log(`Listening on ${PORT}`));

// *********************
// MODELS
// *********************

function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.formatted_address;
  this.latitude = res.geometry.location.lat;
  this.longitude = res.geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

function Meetup(meetup) {
  this.tableName = 'meetups';
  this.link = meetup.link;
  this.name = meetup.group.name;
  this.creation_date = new Date(meetup.group.created).toString().slice(0, 15);
  this.host = meetup.group.who;
  this.created_at = Date.now();
}

function Yelp(yelp) {
  this.url = yelp.url;
  this.name = yelp.name;
  this.rating = yelp.rating;
  this.price = yelp.price;
  this.image_url = yelp.image_url;
}

function Movie(movie) {
  this.title = movie.title;
  this.released_on = movie.release_date;
  this.total_votes = movie.vote_count;
  this.average_votes = movie.vote_average;
  this.popularity = movie.popularity;
  this.image_url = 'http://image.tmdb.org/t/p/w300/' + movie.poster_path;
  this.overview = movie.overview;
}

function Trail(response) {
  this.trail_url = response.url;
  this.name = response.name;
  this.location = response.location;
  this.length = response.length;
  this.condition_date = new Date(response.conditionDate).toString().slice(0,10);
  this.condition_time = new Date(response.conditionDate).getHours() + ':' + new Date(response.conditionDate).getMinutes();
  this.conditions = response.conditionDetails;
  this.stars = response.stars;
  this.star_votes = response.starVotes;
  this.summary = response.summary;
}

// *********************
// HELPER FUNCTIONS
// *********************

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

function getLocation(query) {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [query];

  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        return result.rows[0];

      } else {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

        return superagent.get(url)
          .then(data => {
            if (!data.body.results.length) { throw 'no Data' }

            else {
              let location = new Location(query, data.body.results[0]);

              let newSQL = `INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id;`;
              let newValues = Object.values(location);

              return client.query(newSQL, newValues)
                .then(result => {
                  location.id = result.rows[0].id;
                  return location;
                })
                .catch(console.error);
            }
          })
          .catch(error => console.log('Error in SQL Call'));
      }
    });
}

function getWeather(request, response) {
  const SQL = `SELECT * FROM weathers WHERE location_id=$1;`;
  const values = [request.query.data.id];

  return client.query(SQL, values)
    .then(result => {
      if(result.rowcount>0){
        console.log('FROM SQL');
        response.send(result.rows[0]);
      } else {
        const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

        superagent.get(url)
          .then(result => {
            const weatherSummaries = result.body.daily.data.map(day => {
              const summary = new Weather(day);
              return summary;
            });
            let newSQL = `INSERT INTO weathers(forecast, time, location_id) VALUES ($1, $2, $3);`;
            console.log('151', weatherSummaries)
            weatherSummaries.forEach(summary => {
              let newValues = Object.values(summary);
              newValues.push(request.query.data.id);
              return client.query(newSQL, newValues)
                .then(result => {
                  console.log('158', result.rows);
                  console.log('161', result.rows[0].id)
                })
                .catch(console.error);
            })
            response.send(weatherSummaries);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getMeetups(request, response) {
  const SQL = `SELECT * FROM meetups WHERE location_id=$1;`;
  const values = [request.query.data.id]
  return client.query(SQL, values)
    .then(result => {
      if(result.rowcount>0){
        response.send(result.rows);
      } else {
        const url = `https://api.meetup.com/find/upcoming_events?&sign=true&photo-host=public&lon=${request.query.data.longitude}&page=20&lat=${request.query.data.latitude}&key=${process.env.MEETUPS_API_KEY}`;
        superagent.get(url)
          .then(result => {
            const meetups = result.body.events.map(meetup =>{
              const event = new Meetup(meetup);
              return event;
            });
            let newSQL = `INSERT INTO meetups(link, name, creation_date, host, location_id) values ($1, $2, $3, $4, $5);`;
            meetups.forEach(meetup => {
              let newValues = Object.values(meetup);
              newValues.push(request.query.data.id);
              return client.query(newSQL, newValues)
                .then(result=> {
                })
                .catch(console.error);
            })
            response.send(meetups);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getYelp(request, response) {
  const SQL = `SELECT * FROM yelp WHERE location_id=$1;`;
  const values = [request.query.data.id];
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount>0) {
        response.send(result.rows);
      } else {
        const url = `https://api.yelp.com/v3/businesses/search?latitude=${request.query.data.latitude}&longitude=${request.query.data.longitude}`;
        superagent.get(url)
          .set({ 'Authorization': `Bearer ${process.env.YELP_API_KEY}` })
          .then(result => {
            const yelps = result.body.businesses.map(yelp => {
              return new Yelp(yelp);
            });
            let newSQL = `INSERT INTO yelps(url, name, rating, price, image_url, location_id) VALUES ($1, $2, $3, $4, $5, $6);`;
            yelps.forEach(yelp => {
              let newValues = Object.values(yelp);
              newValues.push(request.query.data.id);
              return client.query(newSQL, newValues)
                .then(result => {
                })
                .catch(error => handleError(error, response));
            })
            response.send(yelps);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getMovies(request, response) {
  const SQL = `SELECT * FROM movies WHERE location_id=$1;`;
  const values = [request.query.data.id];
  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount>0) {
        response.send(result.rows);
      } else {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIEDB_API_KEY}&language=en-US&page=1&include_adult=false&query=${request.query.data.search_query}`;
        superagent.get(url)
          .then(result => {
            const movies = result.body.results.map(movie => {
              return new Movie(movie)
            });
            let newSQL = `INSERT INTO movies(title, released_on, total_votes, average_votes, popularity, image_url, overview, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`;
            movies.forEach(movie => {
              let newValues = Object.values(movie);
              newValues.push(request.query.data.id);
              return client.query(newSQL, newValues)
                .then(result => {
                })
                .catch(error => handleError(error, response));
            })
            response.send(movies);
          })
          .catch(error => handleError(error, response));
      }
    })
}

function getTrails(request, response) {
  const SQL = `SELECT * FROM trails WHERE location_id=$1;`;
  const values = [request.query.data.id];

  return client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        response.send(result.rows);
      } else {
        const url = `https://www.hikingproject.com/data/get-trails?lat=${request.query.data.latitude}&lon=${request.query.data.longitude}&maxDistance=10&key=${process.env.TRAILS_API_KEY}`;
        superagent.get(url)
          .then(result => {
            const trails = result.body.trails.map(trail => {
              return new Trail(trail)
            });
            let newSQL = `INSERT INTO trails(trail_url, name, location, length, condition_date, condition_time, conditions, stars, star_votes, summary, location_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`;
            trails.forEach(trail => {
              let newValues = Object.values(trail);
              newValues.push(request.query.data.id);
              return client.query(newSQL, newValues)
                .then(result => {
                })
                .catch(error => handleError(error, response));
            })
            response.send(trails);
          })
          .catch(error => handleError(error, response));
      }
    })
}
