/* eslint-disable max-len */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTranscribe1777020000000 implements MigrationInterface {
    name = 'AddTranscribe1777020000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "rule" ADD "transcribe" boolean NOT NULL DEFAULT (0)`);
        await queryRunner.query(`ALTER TABLE "reserve" ADD "transcribe" boolean NOT NULL DEFAULT (0)`);
        await queryRunner.query(`ALTER TABLE "recorded" ADD "transcribe" boolean NOT NULL DEFAULT (0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recorded" DROP COLUMN "transcribe"`);
        await queryRunner.query(`ALTER TABLE "reserve" DROP COLUMN "transcribe"`);
        await queryRunner.query(`ALTER TABLE "rule" DROP COLUMN "transcribe"`);
    }
}
