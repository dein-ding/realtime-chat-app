import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength, ValidationOptions } from 'class-validator';

export const validation: {
    [key: string]: {
        [key: string]: [any, ValidationOptions];
    };
} = {
    pwd: {
        matches: [
            /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-ZÄÖÜß])(?=.*[a-zäöüß]).*$/,
            {
                message:
                    'Password should contain an upper case letter, a lower case letter and a special character or digit',
            },
        ],
        minLength: [8, { message: 'Password should be at least 8 characters long' }],
    },
    usr: {
        minLength: [3, { message: 'Username should be at least 3 characters long' }],
        maxLength: [20, { message: 'Username should not be longer than 20 characters' }],
    },
    email: {
        isEmail: [{}, { message: 'You must provide a valid email address' }],
    },
};

export class Password {
    @IsNotEmpty()
    @MinLength(...validation.pwd.minLength)
    @Matches(...validation.pwd.matches)
    password: string;
}

export class Username {
    // @IsNotEmpty()
    @MinLength(...validation.usr.minLength)
    @MaxLength(...validation.usr.maxLength)
    username: string;
}

export class SignupCredentialsDTO extends Username {
    @IsEmail(...validation.email.isEmail)
    email: string;

    @MinLength(...validation.pwd.minLength)
    @Matches(...validation.pwd.matches)
    password: string;
}

export class LoginCredentialsDTO {
    @IsNotEmpty({ message: 'You must provide your username or email adress' })
    @IsString()
    usernameOrEmail: string;

    @IsNotEmpty()
    @IsString()
    password: string;
}
