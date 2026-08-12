<?php

namespace Database\Factories;

use App\Models\UsCustomer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<UsCustomer> */
class UsCustomerFactory extends Factory
{
    protected $model = UsCustomer::class;

    public function definition(): array
    {
        return [
            'name'     => fake()->name(),
            'email'    => fake()->unique()->safeEmail(),
            'phone'    => fake()->numerify('619555####'),
            'password' => 'password', // cast hashed
            'address'  => fake()->streetAddress(),
            'city'     => 'San Diego',
            'state'    => 'CA',
            'zip'      => '92101',
            'country'  => 'United States',
        ];
    }
}
