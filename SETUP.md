# Setup Guide - Nutrafi Kitchen Management System

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://user:password@host:5432/database"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-secret-key-here"
NODE_ENV="development"
```

**Important**: Generate a secure `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Set Up Database (Neon PostgreSQL)

1. Create a new database on [Neon](https://neon.tech)
2. Copy the connection string
3. Update `DATABASE_URL` in `.env`

### 4. Run Database Migrations
```bash
npm run db:migrate
```

This will:
- Create all database tables
- Set up relationships
- Generate Prisma Client

### 5. Create Admin User
```bash
npm run db:seed
```

This creates an admin user:
- Email: `admin@nutrafi.com`
- Password: `admin123`

**⚠️ Change the password after first login!**

### 6. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and login with the admin credentials.

## Database Schema Overview

The system uses the following main models:

- **User**: System users (Admin, Manager, Chef)
- **Dish**: Menu items with nutritional info
- **Customer**: Subscribers
- **Plan**: Predefined meal plans
- **MealPlan**: Customer meal subscriptions
- **MealPlanItem**: Individual meal assignments
- **Payment**: Payment tracking

## User Roles

### Admin
- Full access to all modules
- Can manage users, menu, customers, meal plans
- Access to production dashboard and reports
- Can export data

### Manager
- Can manage customers and meal plans
- Can view production dashboard
- Can export data
- Cannot manage system users

### Chef
- Can only view production dashboard
- Can filter and export production sheets
- No edit permissions

## Creating Additional Users

You can create users through Prisma Studio:
```bash
npm run db:studio
```

Or create a script similar to `scripts/seed-admin.ts`.

## Production Deployment

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (your domain)
   - `NEXTAUTH_SECRET`
4. Deploy

### Database Migrations in Production
```bash
npx prisma migrate deploy
```

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check if database allows connections from your IP
- For Neon, ensure connection pooling is configured

### Authentication Issues
- Verify `NEXTAUTH_SECRET` is set
- Check `NEXTAUTH_URL` matches your domain
- Clear browser cookies if session issues occur

### Prisma Issues
- Run `npm run db:generate` to regenerate Prisma Client
- Check Prisma schema for syntax errors
- Verify database migrations are up to date

## Next Steps

1. **Customize Plans**: Add your meal plans in the Plans module
2. **Add Menu Items**: Populate the menu with your dishes
3. **Create Customers**: Add your existing customers
4. **Set Up Meal Plans**: Create meal plans for customers
5. **Train Staff**: Show managers and chefs how to use the system

## Support

For issues or questions, refer to the main README.md or contact the development team.

