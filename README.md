# Nutrafi Kitchen - Meal Subscription Management System

A comprehensive web-based system for managing meal subscriptions, customers, and kitchen production for Nutrafi Kitchen restaurant.

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Prisma ORM** with PostgreSQL (Neon)
- **NextAuth.js** for authentication
- **Tailwind CSS** for styling
- **Vercel** for hosting

## Features

### 1. Authentication & Role Management
- Role-based access control (Admin, Manager, Chef)
- Secure login system
- Protected routes

### 2. Menu Management
- CRUD operations for dishes
- Advanced filtering (category, calories, protein, allergens, etc.)
- Export to Excel
- Nutritional information tracking

### 3. Customer Management
- Customer database with subscription details
- Filter by status, plan type, delivery area
- Pause/resume subscriptions
- Time slot management

### 4. Plans Management
- Predefined meal plans with pricing
- Weekly/Monthly/Custom plans
- Plan activation/deactivation

### 5. Meal Plan Management (Core Module)
- Create meal plans for customers
- Auto-generate meal slots based on date range and meals per day
- Assign dishes to meal slots
- Daily macro totals calculation
- Skip meals/days functionality
- Custom notes per meal/day/plan

### 6. Production Dashboard
- Aggregated dish quantities by date/time
- Filter by date, time slot, delivery area, dish, customer
- Export production sheets to Excel
- Real-time production data for chefs

### 7. Payment Tracking
- Record payments for customers
- Link payments to meal plans or predefined plans
- Payment status tracking
- Revenue reporting

### 8. Reporting
- Active customers count
- Most ordered dishes
- Weekly production summary
- Revenue tracking

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database (Neon recommended)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd nutrify
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
```

Update `.env` with your database URL and NextAuth secret:
```
DATABASE_URL="postgresql://user:password@host:5432/database"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"
```

4. Set up the database
```bash
npx prisma migrate dev
```

5. Generate Prisma Client
```bash
npx prisma generate
```

6. Create an admin user (run this in a script or Prisma Studio)
```typescript
// You'll need to hash the password using bcrypt
// Example: hash password "admin123" and create user
```

7. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Schema

The system uses the following main models:
- **User** - System users (Admin, Manager, Chef)
- **Dish** - Menu items with nutritional information
- **Customer** - Subscribers with delivery details
- **Plan** - Predefined meal plans with pricing
- **MealPlan** - Customer meal subscriptions
- **MealPlanItem** - Individual meal assignments
- **Payment** - Payment tracking

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Database Setup (Neon)

1. Create a Neon PostgreSQL database
2. Copy the connection string to `DATABASE_URL`
3. Run migrations: `npx prisma migrate deploy`

## User Roles

- **Admin**: Full access to all modules
- **Manager**: Can manage customers, meal plans, view production, but cannot manage system users
- **Chef**: Can only view production dashboard and export production sheets

## API Routes

- `/api/menu` - Menu management
- `/api/customers` - Customer management
- `/api/meal-plans` - Meal plan management
- `/api/plans` - Predefined plans
- `/api/production` - Production dashboard data
- `/api/payments` - Payment tracking
- `/api/reports` - Reporting data

## Future Enhancements

- Customer portal with login
- Online payment integration (Stripe/Razorpay)
- Email/SMS notifications
- Mobile app for customers
- Advanced analytics and reporting
- Inventory management
- Delivery tracking

## License

Private - Nutrafi Kitchen
# Nutrafi
