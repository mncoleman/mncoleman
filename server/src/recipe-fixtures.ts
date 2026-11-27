import type { Recipe } from './recipe';

// The two charts the Recipe Generator project produced as PDFs, as data.
export const PASTA: Recipe = {
    title: 'One-Pot Creamy Tomato Pesto Pasta',
    meta: [
        { label: 'Serves', value: '4' },
        { label: 'Prep', value: '15 min' },
        { label: 'Cook', value: '20 min' },
        { label: 'Total', value: '35 min' },
    ],
    setup: ['Use a deep braising pan (or wide, deep skillet) with a fitted lid. No preheating needed.'],
    ingredients: [
        { amount: '10 oz', metric: '285 g', name: 'dry mafaldine pasta' },
        { amount: '1/3', name: 'red onion', note: 'diced' },
        { amount: '2 cups', metric: '60 g', name: 'baby spinach', note: 'long stems trimmed' },
        { amount: '1 pint', metric: '300 g', name: 'cherry tomatoes', note: 'halved' },
        { amount: '1/3 cup', metric: '80 g', name: 'tomato sauce' },
        { amount: '5 cloves', name: 'garlic', note: 'sliced' },
        { amount: '2 Tbsp', metric: '30 g', name: 'basil pesto' },
        { amount: '2 tsp', name: 'Italian seasoning' },
        { amount: '1 tsp', name: 'smoked paprika' },
        { amount: '1/2 tsp', name: 'each salt and cracked black pepper' },
        { amount: '2 Tbsp', metric: '28 g', name: 'butter' },
        { amount: '1 Tbsp', metric: '15 mL', name: 'olive oil' },
        { amount: '2 cups', metric: '480 mL', name: 'chicken stock' },
        { amount: '3/4 cup', metric: '180 mL', name: 'heavy cream' },
        { amount: '2 oz', metric: '55 g', name: 'Parmesan', note: 'freshly shredded' },
        { amount: '1/2', name: 'lemon', note: 'juiced' },
    ],
    steps: [
        { label: 'layer in order, spread evenly', col: 1, from: 1, to: 12 },
        { label: 'pour in', col: 1, from: 13, to: 14 },
        { label: 'medium heat until gently bubbling', col: 2, from: 1, to: 14 },
        { label: 'cover, reduce to gentle simmer 8 to 9 min', col: 3, from: 1, to: 14 },
        { label: 'uncover, press noodles down, re-cover', col: 4, from: 1, to: 14 },
        { label: 'simmer 15 to 20 min total', col: 5, from: 1, to: 14 },
        { label: 'uncover, toss until coated', col: 6, from: 1, to: 16 },
        { label: 'serve warm', col: 7, from: 1, to: 16 },
    ],
    notes:
        'Halfway check: at 8 to 9 minutes the pasta should be softer but not cooked. Pressing it into the liquid helps exposed pieces cook evenly. If the pan looks dry before the pasta is tender, add a small splash of warm chicken stock.\n\nThe sauce should look slightly loose when you uncover. It thickens as you toss in the Parmesan and as it rests. Spaghetti, linguine or fettuccine work in place of mafaldine; adjust time and liquid as needed.',
    tags: ['pasta', 'one pot', 'dinner'],
    source: { text: 'Recipe by Mallory Austin, Bad Batch Baking.', url: 'https://badbatchbaking.com/one-pot-creamy-tomato-pesto-pasta/' },
    metric_approx: true,
};

export const MUFFIN: Recipe = {
    title: 'Chocolate Mug Muffin',
    meta: [
        { label: 'Makes', value: 'one mug muffin' },
        { label: 'Cook', value: '1 minute in the microwave' },
        { label: 'Method', value: 'all in one coffee cup' },
    ],
    setup: ['Use a coffee cup and a fork', 'Have a microwave ready (1 minute)'],
    ingredients: [
        { amount: '1', metric: 'about 50 g', name: 'egg' },
        { amount: '1½ Tbs', metric: 'about 10 g', name: 'golden flax meal' },
        { amount: '1½ Tbs', metric: 'about 10 g', name: 'almond flour', note: 'or grind your own' },
        { amount: '1 heaping Tbs', metric: 'about 7 g', name: 'unsweetened cocoa powder' },
        { amount: '2 to 4 tsp', metric: 'about 10 to 20 mL', name: 'Truvia', note: 'or a few shakes of Nunaturals' },
        { amount: '½ tsp', metric: 'about 2 g', name: 'aluminum free baking powder' },
        { amount: '1 flat Tbs', metric: 'about 14 g', name: 'coconut oil', note: 'extra virgin or cooking style' },
    ],
    steps: [
        { label: 'crack in cup, whisk well with fork', col: 1, from: 1, to: 1 },
        { label: 'add', col: 2, from: 2, to: 7 },
        { label: 'stir vigorously', col: 3, from: 1, to: 7 },
        { label: 'microwave 1 min', col: 4, from: 1, to: 7 },
        { label: 'Turn the mug upside down and thump a little; the muffin should plop out onto a plate. Cut in half and top with a little butter or Greek yogurt.', col: 5, from: 1, to: 7 },
    ],
    notes:
        'Sweetness is up to you: start with 3 tsp Truvia and adjust, with 2 tsp for some tastes and 4 tsp for those switching from a high sugar diet. Cooking style coconut oil works as well as extra virgin. It does not matter if the oil is solid from being cold.',
    source: { text: 'Photographed book page headed "Chocolate Version" (author and title not shown).' },
    metric_approx: true,
};
