/* eslint-disable max-len */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatedUser1777010000000 implements MigrationInterface {
    name = 'AddCreatedUser1777010000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rule" ADD "createdUser" text NULL`);
        await queryRunner.query(`ALTER TABLE "reserve" ADD "createdUser" text NULL`);
        await queryRunner.query(`ALTER TABLE "recorded" ADD "createdUser" text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recorded" DROP COLUMN "createdUser"`);
        await queryRunner.query(`ALTER TABLE "reserve" DROP COLUMN "createdUser"`);
        await queryRunner.query(`ALTER TABLE "rule" DROP COLUMN "createdUser"`);
    }
}
