import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CarrinhoService } from './carrinho.service';
import { AdicionarAoCarrinhoDto } from './dto/adicionar-ao-carrinho.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Carrinho (Vitrine)')
@Public()
@Controller('vitrine/:slug/carrinho')
export class CarrinhoController {
  constructor(private service: CarrinhoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar itens do carrinho' })
  @ApiQuery({ name: 'sessionId', required: true })
  listar(@Param('slug') slug: string, @Query('sessionId') sessionId: string) {
    return this.service.listar(slug, sessionId);
  }

  @Post()
  @ApiOperation({ summary: 'Adicionar item ao carrinho' })
  adicionar(
    @Param('slug') slug: string,
    @Query('sessionId') sessionId: string,
    @Body() dto: AdicionarAoCarrinhoDto,
  ) {
    return this.service.adicionar(slug, sessionId, dto);
  }

  @Patch(':itemId')
  @ApiOperation({ summary: 'Atualizar quantidade de item' })
  atualizar(
    @Param('slug') slug: string,
    @Query('sessionId') sessionId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body('quantidade') quantidade: number,
  ) {
    return this.service.atualizarQuantidade(slug, sessionId, itemId, quantidade);
  }

  @Delete(':itemId')
  @ApiOperation({ summary: 'Remover item do carrinho' })
  remover(
    @Param('slug') slug: string,
    @Query('sessionId') sessionId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.service.removerItem(slug, sessionId, itemId);
  }
}
