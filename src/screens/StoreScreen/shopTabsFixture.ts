/**
 * Dev-only fixture: the Shark Shop exactly as live production serves it (rotation engine off, so
 * the classic grid). Store 1, catalog 11 and its 9 featured items from the Oct 2 2026 prod dump,
 * at the repriced coin ladder; art from the production CDN. Two items owned (Blue Shark, Lollipop).
 */
/* eslint-disable */
export const LEGACY_STORE = {
 "id": "1",
 "name": "Shark Shop",
 "current_catalog_id": 11,
 "is_secret_store": false,
 "icon_url": "",
 "background_url": "https://assets.themeparkshark.com/mobile/production/assets/RicWa6bO206w9p56cuFjGeXZbqE4XUrP9F44wTNz.png"
};
export const LEGACY_CATALOG = {
 "id": 11,
 "name": "December 2023",
 "currencies": [
  {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 ],
 "promotion_image_url": "https://assets.themeparkshark.com/mobile/production/assets/Kj6QxDEYaHYWTuXI0DN6eOIar19LDhHgBQ62PxkM.png"
};
export const LEGACY_ITEMS = [
 {
  "id": 142,
  "name": "Red Shark",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/tATqzPsirdFVUeTeLLAZPiC5XfHKf45NY2tRI7I7.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/tjdpUwiV2FMxiL21snIXSju0iDfusA51ikdPox4G.png",
  "no_eye_url": "https://assets.themeparkshark.com/mobile/production/assets/EocIvD5ke8nJoQf08a6UOp2SF3yi27Gd7Nh7U2iH.png",
  "item_type": {
   "id": 7,
   "name": "Skin item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 143,
  "name": "Orange Shark",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/VL9im5EIUDTBZqRJtpyvE7mtlC6tGb5n6IeyzXk1.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/29uIjOCv34eBzwirVBigr5yZ5sQyIKZZuAZnIrXB.png",
  "no_eye_url": "https://assets.themeparkshark.com/mobile/production/assets/e492RBE1aAxEIGwgkBdWVdgNo8Gj4Sl9oJ4x2kYE.png",
  "item_type": {
   "id": 7,
   "name": "Skin item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 141,
  "name": "Black Shark",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/Iv20stWVjD8LtCERHi1noRy3PtROdt6gSZB8EohA.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/znKHROhm2zNqG0JhyZdA8OzaBUtJMNPCZ1j6WQpy.png",
  "no_eye_url": "https://assets.themeparkshark.com/mobile/production/assets/tMBJEyXUosBGCH0KsDTSIqcsje0OPaXAkz9C95Pl.png",
  "item_type": {
   "id": 7,
   "name": "Skin item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 140,
  "name": "Blue Shark",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/x4S2QoF3SpwNsMM7neLaVL2a7YU1m1RSsXnBDC2p.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/x7oThBeqg0z30sI86hxHupdlUyJY9kOBmyMFYhV9.png",
  "no_eye_url": "https://assets.themeparkshark.com/mobile/production/assets/F1HeAQPd5unDIEG9n9BkW72y8A6FG1N4EZLM7DjI.png",
  "item_type": {
   "id": 7,
   "name": "Skin item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": true,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 138,
  "name": "Pink Shark",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/ViknUDb0hf9j6jCqnGx3EhohbiczDIX6Hp1xfUHW.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/R7oYvWxsGEg1V4zmNKMjtqqmir13zilEpwQVN0UR.png",
  "no_eye_url": "https://assets.themeparkshark.com/mobile/production/assets/9CNW62pENCCsmfw8Lp3Z4UZV8ttcsBMfjdUTr6JD.png",
  "item_type": {
   "id": 7,
   "name": "Skin item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 412,
  "name": "Northern Lights BG",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/0tnPnubXSJb76ivW2VJieDKEQbHjp2BW9euK2ZzB.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/uLXtllntYaOlK9ZEyiK1C8NTbLNOFRQ71errpuUZ.png",
  "no_eye_url": null,
  "item_type": {
   "id": 6,
   "name": "Background item",
   "image_url": ""
  },
  "cost": 80,
  "rarity": 2,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 393,
  "name": "Lollipop",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/RNbyebdWc9qheNLBFDNc4JLpFjA4o1kWuCGe0m3v.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/Kh7X9DzmCZWevZauvRP5OXuHjg2f6ECYvlSHnz7Z.png",
  "no_eye_url": null,
  "item_type": {
   "id": 5,
   "name": "Hand item",
   "image_url": ""
  },
  "cost": 50,
  "rarity": 1,
  "has_purchased": true,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 391,
  "name": "White Gloves",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/EjnfPenB3EFEvWuIVifFxhLM2U4sJIJep2p1xCyh.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/NXZwnanFtDzc7eNuKbXPErtXnpVXZsYN6vPQ9b39.png",
  "no_eye_url": null,
  "item_type": {
   "id": 5,
   "name": "Hand item",
   "image_url": ""
  },
  "cost": 280,
  "rarity": 4,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 },
 {
  "id": 401,
  "name": "Red Face Paint",
  "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/WBV8eS76O0MM5PjvpgllFDcEZ7oOwYUoPXOntdnO.png",
  "paper_url": "https://assets.themeparkshark.com/mobile/production/assets/wfD8ILlkWaHPgU1XwkfjTqUUhKpSj1tClvK1Dhr8.png",
  "no_eye_url": null,
  "item_type": {
   "id": 2,
   "name": "Face item",
   "image_url": ""
  },
  "cost": 140,
  "rarity": 3,
  "has_purchased": false,
  "latitude": 0,
  "longitude": 0,
  "section": "shop",
  "is_hidden": false,
  "is_clearance": false,
  "is_coin_code_item": false,
  "is_member_item": false,
  "currency": {
   "id": 1,
   "name": "Coins",
   "icon_url": "https://assets.themeparkshark.com/mobile/production/assets/w9rcptfRvxgHXfI8t9nbSo8go4bgCSd6LM1Od3fq.png"
  }
 }
];
